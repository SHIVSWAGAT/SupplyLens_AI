// Frontend must use only a public backend base URL. Private provider keys stay on the backend.
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

export const API_BASE = configuredApiBase
  || (typeof window !== "undefined" ? window.location.origin : "");

export const STATUS_COLORS = {
  "On Time": "#22c55e",
  "At Risk": "#f59e0b",
  Delayed: "#fb7185",
  Critical: "#ef4444",
  Delivered: "#38bdf8",
};

export const MODE_COLORS = {
  Air: "#38bdf8",
  Sea: "#2dd4bf",
  Road: "#f59e0b",
  Rail: "#a78bfa",
};

export const WEATHER_SEVERITY_COLORS = {
  Low: "#38bdf8",
  Moderate: "#f59e0b",
  High: "#ef4444",
};

export function hasCoordinates(point) {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  );
}

export function formatPercent(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) {
    return "No data available";
  }
  return `${Number(value || 0).toFixed(digits)}%`;
}

export function formatFractionPercent(value, digits = 0) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

export function getPrediction(shipment) {
  return shipment?.ml_prediction || null;
}

export function getPredictedEta(shipment) {
  return getPrediction(shipment)?.predicted_eta || shipment?.estimated_arrival || "N/A";
}

export function getConfidencePercent(shipment) {
  return `${Math.round(Number(getPrediction(shipment)?.confidence || 0) * 100)}%`;
}

export function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "No data available";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatDateTime(value) {
  if (!value) {
    return "No data available";
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function formatETA(value) {
  if (!value) {
    return "No data available";
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return String(value).replace("T", " ").slice(0, 16);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatDelay(delayMinutes) {
  if (delayMinutes == null || Number.isNaN(Number(delayMinutes))) {
    return "No data available";
  }
  const minutes = Number(delayMinutes || 0);
  if (minutes > 0) {
    return `+${minutes} min delay`;
  }
  if (minutes < 0) {
    return `${minutes} min early`;
  }
  return "On schedule";
}

export function getDelayColor(delayMinutes) {
  const minutes = Number(delayMinutes || 0);
  if (minutes > 0) {
    return "#f87171";
  }
  if (minutes < 0) {
    return "#4ade80";
  }
  return "#94a3b8";
}

export function getStatusColor(status) {
  const value = String(status || "").toLowerCase();
  if (value === "on time") {
    return "#22c55e";
  }
  if (value === "at risk") {
    return "#facc15";
  }
  if (value === "delayed") {
    return "#fb923c";
  }
  if (value === "critical") {
    return "#b91c1c";
  }
  return "#64748b";
}

export function getRiskColor(riskPercent) {
  const value = Number(riskPercent || 0);
  if (value <= 30) {
    return "#22c55e";
  }
  if (value <= 60) {
    return "#facc15";
  }
  if (value <= 80) {
    return "#fb923c";
  }
  return "#ef4444";
}

export function getRiskToneLabel(riskPercent) {
  const value = Number(riskPercent || 0);
  if (value <= 30) {
    return "Low";
  }
  if (value <= 60) {
    return "Moderate";
  }
  return "High";
}

export function getModeTone(mode) {
  const value = String(mode || "").toLowerCase();
  if (value === "air") {
    return "air";
  }
  if (value === "rail") {
    return "rail";
  }
  if (value === "sea") {
    return "sea";
  }
  if (value === "road") {
    return "road";
  }
  return "default";
}

export function buildWebSocketUrl(apiBase, token) {
  const normalized = apiBase.startsWith("http")
    ? apiBase
    : `${window.location.origin}${apiBase.startsWith("/") ? apiBase : `/${apiBase}`}`;
  const url = new URL(normalized);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/live";
  url.search = "";
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

export function computeMapCenter(shipments) {
  const validShipments = shipments.filter((shipment) => hasCoordinates(shipment.current_coords));
  if (!validShipments.length) {
    return [20, 0];
  }

  const sums = validShipments.reduce(
    (accumulator, shipment) => {
      accumulator.lat += Number(shipment.current_coords.lat);
      accumulator.lng += Number(shipment.current_coords.lng);
      return accumulator;
    },
    { lat: 0, lng: 0 },
  );

  return [sums.lat / validShipments.length, sums.lng / validShipments.length];
}

export function buildStatusData(stats, shipments) {
  const entries = stats?.by_status
    ? Object.entries(stats.by_status)
    : aggregateShipments(shipments, "status");

  return entries.map(([name, value]) => ({
    name,
    value,
    color: STATUS_COLORS[name] || "#94a3b8",
  }));
}

export function buildModeData(stats, shipments) {
  const entries = stats?.by_mode
    ? Object.entries(stats.by_mode)
    : aggregateShipments(shipments, "mode");

  return entries.map(([name, value]) => ({
    name,
    value,
    color: MODE_COLORS[name] || "#94a3b8",
  }));
}

export function buildRiskBuckets(shipments) {
  const buckets = [
    { name: "Low", min: 0, max: 0.25, value: 0, color: "#22c55e" },
    { name: "Moderate", min: 0.25, max: 0.5, value: 0, color: "#f59e0b" },
    { name: "High", min: 0.5, max: 0.75, value: 0, color: "#fb7185" },
    { name: "Critical", min: 0.75, max: 1.1, value: 0, color: "#ef4444" },
  ];

  shipments.forEach((shipment) => {
    const score = Number(shipment.risk_score || 0);
    const bucket = buckets.find((item) => score >= item.min && score < item.max);
    if (bucket) {
      bucket.value += 1;
    }
  });

  return buckets;
}

export function normalizeMonthlyTrends(trends, months = 6, now = new Date()) {
  const normalized = [];
  const incoming = new Map(
    (Array.isArray(trends) ? trends : []).map((entry) => [String(entry?.month || ""), entry || {}]),
  );

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = cursor.toLocaleString("en-US", { month: "short" });
    const entry = incoming.get(month) || {};
    normalized.push({
      month,
      on_time: Number(entry.on_time || 0),
      delayed: Number(entry.delayed || 0),
      critical: Number(entry.critical || 0),
    });
  }

  return normalized;
}

export function getHighRiskShipments(shipments) {
  return [...shipments]
    .filter((shipment) => Number(shipment.risk_score || 0) >= 0.65)
    .sort((left, right) => Number(right.risk_score || 0) - Number(left.risk_score || 0));
}

export function statusClassName(status) {
  return String(status || "default").toLowerCase().replace(/\s+/g, "-");
}

export function calculateShipmentCost(shipment) {
  const rates = { Sea: 2.8, Air: 11.5, Road: 4.2, Rail: 3.0 };
  const rate = rates[shipment?.mode] || 3.5;
  const total = 8000 * rate + Number(shipment?.weight_kg || 1000) * 0.025;
  const progress = Number(shipment?.progress_pct || 0) / 100;
  const incurred = total * progress;
  return {
    total,
    incurred,
    remaining: total - incurred,
  };
}

export function buildAiInsights({ kpis, shipments, weatherAdvisories, weatherCities }) {
  if (!shipments.length) {
    return ["No data available for shipment insights yet."];
  }
  const highRisk = shipments.filter((shipment) => Number(shipment.risk_score || 0) >= 0.65);
  const likelyDelayed = shipments.filter((shipment) => {
    const score = Number(shipment.risk_score || 0);
    return shipment.status === "At Risk" || (score >= 0.55 && shipment.status !== "Critical");
  });
  const anomalies = shipments.filter((shipment) => shipment.ml_prediction?.anomaly_detected);

  const rerouteSavings = highRisk.slice(0, 5).reduce((sum, shipment) => {
    const options = Array.isArray(shipment.route_options) ? shipment.route_options : [];
    if (options.length < 2) {
      return sum;
    }
    const currentCost = Number(options[0].cost_usd || 0);
    const cheapestCost = Math.min(...options.map((option) => Number(option.cost_usd || 0)));
    return sum + Math.max(currentCost - cheapestCost, 0);
  }, 0);

  const highestWeather = [...weatherCities].sort((left, right) => Number(right.risk_score || 0) - Number(left.risk_score || 0))[0];
  const criticalWeather = weatherAdvisories.filter((alert) => alert.severity === "Critical").length;

  return [
    `⚠ ${likelyDelayed.length} shipments are predicted to face delays in the next execution window, and ${anomalies.length} show anomaly patterns beyond normal lane behavior.`,
    `💰 Potential cost saving: ${formatCurrency(rerouteSavings || Number(kpis?.cost_savings_usd || 0) * 0.12)} by shifting high-risk shipments to cheaper or safer alternates with comparable confidence.`,
    highestWeather
      ? `🌦 ${highestWeather.city} has the highest weather exposure right now with a ${highestWeather.risk_score}/100 risk score and ${criticalWeather} route advisories in play.`
      : "🌦 Weather telemetry is updating and will surface the highest-risk city shortly.",
  ];
}

export function buildTimeline(shipment) {
  if (!shipment) {
    return [];
  }

  return [
    {
      label: shipment.origin,
      description: `Departed ${formatDateTime(shipment.departure_time)}`,
      state: "completed",
    },
    {
      label: "Current Position",
      description: `${formatPercent(shipment.progress_pct)} complete • ${shipment.status}`,
      state: "active",
    },
    {
      label: shipment.destination,
      description: `ETA ${formatDateTime(shipment.estimated_arrival)}`,
      state: "pending",
    },
  ];
}

export function normalizeAlerts(alerts = [], weatherAdvisories = [], shipments = []) {
  const shipmentMap = new Map(shipments.map((shipment) => [shipment.id, shipment]));

  const normalizeItem = (alert) => {
    const shipment = shipmentMap.get(alert.shipment_id);
    const riskLevel = alert.risk_level || (
      Number(alert.weather_risk || 0) >= 50 ? "Critical" : Number(alert.weather_risk || 0) >= 20 ? "High" : "Moderate"
    );
    return {
      id: alert.id,
      shipment_id: alert.shipment_id,
      tracking_number: alert.tracking_number || shipment?.tracking_number || "Unknown",
      route: alert.route || (shipment ? `${shipment.origin} -> ${shipment.destination}` : `${alert.origin || "Unknown"} -> ${alert.destination || "Unknown"}`),
      risk_level: riskLevel,
      reason: alert.reason || alert.root_cause || alert.weather_desc || "Operational risk",
      affected_city: alert.affected_city || shipment?.destination || "Unknown",
      title: alert.title || `Shipment ${alert.tracking_number} - ${riskLevel} risk`,
      message: alert.message || "No alert detail available.",
      recommended_action: alert.recommended_action || alert.action || alert.alt_route || "Review shipment details.",
      severity: alert.severity || riskLevel,
      timestamp: alert.timestamp || alert.created_at,
      acknowledged: Boolean(alert.acknowledged),
    };
  };

  return [...alerts, ...weatherAdvisories]
    .map(normalizeItem)
    .sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")));
}

export function computeConsignmentRiskPreview(form, weatherCities = []) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  const findWeatherForCity = (name) => {
    const normalized = normalize(name);
    if (!normalized) {
      return null;
    }

    return weatherCities.find((city) => normalize(city.city) === normalized) || null;
  };

  const originWeather = findWeatherForCity(form.origin);
  const destinationWeather = findWeatherForCity(form.destination);
  const weatherSeverity = Math.max(
    Number(originWeather?.risk_score || 0),
    Number(destinationWeather?.risk_score || 0),
  ) / 100;

  let congestionIndex = 0.3;
  if (form.priority === "Critical") {
    congestionIndex = 0.65;
  } else if (form.priority === "Urgent") {
    congestionIndex = 0.45;
  }

  let equipmentHealth = 0.92;
  if (form.mode === "Road") {
    equipmentHealth = 0.86;
  } else if (form.mode === "Sea") {
    equipmentHealth = 0.84;
  } else if (form.mode === "Rail") {
    equipmentHealth = 0.89;
  }

  const routeDeviation = form.origin && form.destination && normalize(form.origin) !== normalize(form.destination) ? 0.15 : 0.05;
  const hazardPenalty = form.hazardous ? 0.18 : 0.04;
  const cargoPenalty = ["Pharmaceuticals", "Perishables", "Chemicals"].includes(form.cargo_type) ? 0.12 : 0.05;
  const weightPenalty = Math.min(Number(form.weight_kg || 0) / 10000, 0.12);
  const locationPenalty = originWeather || destinationWeather ? 0 : 0.08;
  const score = Math.max(
    0,
    Math.min(
      1,
      0.3 * hazardPenalty +
        0.25 * weatherSeverity +
        0.2 * congestionIndex +
        0.15 * (1 - equipmentHealth) +
        0.1 * routeDeviation +
        cargoPenalty +
        weightPenalty +
        locationPenalty,
    ),
  );

  return {
    score: Number(score.toFixed(2)),
    level: score < 0.25 ? "Low" : score < 0.5 ? "Moderate" : score < 0.75 ? "High" : "Critical",
    drivers: [
      form.hazardous ? "Hazardous cargo handling" : "Standard cargo handling",
      weatherSeverity >= 0.5 ? "Elevated weather exposure" : originWeather || destinationWeather ? "Stable weather window" : "Weather data unavailable for selected route",
      congestionIndex >= 0.6 ? "Critical service priority" : "Normal corridor congestion",
      weightPenalty >= 0.08 ? "High shipment weight profile" : "Standard shipment weight profile",
    ],
  };
}

function aggregateShipments(shipments, key) {
  const map = new Map();
  shipments.forEach((shipment) => {
    const value = shipment[key];
    map.set(value, (map.get(value) || 0) + 1);
  });
  return [...map.entries()];
}
