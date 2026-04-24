import { requestJson, requestStream } from "./client.js";

export function getDemoUsers() {
  return requestJson("/api/auth/demo-users", { publicRequest: true });
}

export function login(credentials) {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: credentials,
    publicRequest: true,
  });
}

export function logout(token) {
  return requestJson("/api/auth/logout", { method: "POST", token });
}

export function getProfile(token) {
  return requestJson("/api/auth/me", { token });
}

export function loadPlatformSnapshot(token) {
  const requests = [
    ["shipments", requestJson("/api/shipments", { token })],
    ["stats", requestJson("/api/shipments/stats", { token })],
    ["alerts", requestJson("/api/alerts", { token })],
    ["weatherAdvisories", requestJson("/api/weather/route-advisories", { token })],
    ["weatherCities", requestJson("/api/weather", { token })],
    ["kpis", requestJson("/api/analytics/kpis", { token })],
    ["carriers", requestJson("/api/analytics/carrier-performance", { token })],
    ["trends", requestJson("/api/analytics/monthly-trends", { token })],
    ["regions", requestJson("/api/analytics/region-disruptions", { token })],
    ["aiInsights", requestJson("/api/analytics/ai-insights", { token })],
    ["cities", requestJson("/api/routes/cities", { token })],
  ];

  return Promise.allSettled(requests.map(([, promise]) => promise)).then((settled) =>
    settled.map((result, index) => ({
      key: requests[index][0],
      result,
    })),
  );
}

export function getShipmentAnalysis(token, shipmentId) {
  return requestJson(`/api/shipments/${shipmentId}/analysis`, { token });
}

export function optimizeRoute(token, payload) {
  return requestJson("/api/routes/optimize", {
    method: "POST",
    body: payload,
    token,
  });
}

export function acknowledgeAlert(token, alertId) {
  return requestJson(`/api/alerts/${alertId}/acknowledge`, {
    method: "POST",
    token,
  });
}

export function acknowledgeAllAlerts(token) {
  return requestJson("/api/alerts/acknowledge-all", {
    method: "POST",
    token,
  });
}

export function createConsignment(token, payload) {
  return requestJson("/api/shipments/create", {
    method: "POST",
    body: payload,
    token,
  });
}

export function deleteShipment(token, shipmentId) {
  return requestJson(`/api/shipments/${shipmentId}`, {
    method: "DELETE",
    token,
  });
}

export function refreshWeather(token) {
  return requestJson("/api/weather/refresh", {
    method: "POST",
    token,
  });
}

export function getWeatherBundle(token) {
  return Promise.all([
    requestJson("/api/weather", { token }),
    requestJson("/api/weather/route-advisories", { token }),
  ]);
}

export function sendChatMessage(token, payload) {
  return requestJson("/api/chat", {
    method: "POST",
    body: payload,
    token,
  });
}

export function streamChatMessage(token, payload, onEvent) {
  return requestStream("/api/chat/stream", {
    method: "POST",
    body: payload,
    token,
    onEvent,
  });
}

export function predictRisk(token, payload) {
  return requestJson("/ml/predict-risk", {
    method: "POST",
    body: payload,
    token,
  });
}

export function simulateShipmentScenario(token, payload) {
  return requestJson("/ml/simulate-scenario", {
    method: "POST",
    body: payload,
    token,
  });
}
