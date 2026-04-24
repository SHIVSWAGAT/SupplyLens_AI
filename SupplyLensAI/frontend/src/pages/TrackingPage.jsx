import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

import { PageSkeleton } from "../components/Skeletons.jsx";
import {
  buildTimeline,
  calculateShipmentCost,
  getConfidencePercent,
  getPredictedEta,
  formatDateTime,
  formatFractionPercent,
  formatPercent,
  STATUS_COLORS,
} from "../lib/utils.js";

function TrackingViewport({ shipmentId, bounds }) {
  const map = useMap();

  useEffect(() => {
    let frameId = 0;
    const timers = [];
    let observer = null;

    const refreshSize = () => {
      map.invalidateSize(true);
    };

    refreshSize();
    frameId = window.requestAnimationFrame(refreshSize);
    timers.push(window.setTimeout(refreshSize, 150));
    timers.push(window.setTimeout(refreshSize, 450));

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(refreshSize);
      observer.observe(map.getContainer());
    }

    const onWindowResize = () => refreshSize();
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener("resize", onWindowResize);
    };
  }, [map]);

  useEffect(() => {
    if (!bounds || !shipmentId) {
      return;
    }
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }, [map, shipmentId, bounds]);

  return null;
}

export default function TrackingPage({
  loading,
  onBack,
  onOptimizeRoute,
  onSimulateScenario,
  selectedShipment,
}) {
  const [priority, setPriority] = useState("fastest");
  const [routeState, setRouteState] = useState({
    loading: false,
    error: "",
    selectedRouteId: "",
    routes: [],
  });
  const [scenario, setScenario] = useState({
    weather_delta: 0.2,
    congestion_delta: 0.1,
    delay_delta_minutes: 30,
  });
  const [scenarioState, setScenarioState] = useState({
    loading: false,
    error: "",
    result: null,
  });

  useEffect(() => {
    if (selectedShipment) {
      setRouteState({
        loading: false,
        error: "",
        selectedRouteId: selectedShipment.route_options?.[0]?.id || "",
        routes: selectedShipment.route_options || [],
      });
    }
  }, [selectedShipment]);

  const cost = useMemo(() => calculateShipmentCost(selectedShipment), [selectedShipment]);
  const timeline = useMemo(() => buildTimeline(selectedShipment), [selectedShipment]);
  const trackingBounds = useMemo(() => {
    if (!selectedShipment) {
      return null;
    }
    return [
      [Number(selectedShipment.origin_coords.lat), Number(selectedShipment.origin_coords.lng)],
      [Number(selectedShipment.destination_coords.lat), Number(selectedShipment.destination_coords.lng)],
    ];
  }, [
    selectedShipment?.id,
    selectedShipment?.origin_coords?.lat,
    selectedShipment?.origin_coords?.lng,
    selectedShipment?.destination_coords?.lat,
    selectedShipment?.destination_coords?.lng,
  ]);

  async function optimize() {
    if (!selectedShipment) {
      return;
    }

    setRouteState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const routes = await onOptimizeRoute({
        origin: selectedShipment.origin,
        destination: selectedShipment.destination,
        priority,
      });
      setRouteState({
        loading: false,
        error: "",
        selectedRouteId: routes[0]?.id || "",
        routes,
      });
    } catch (error) {
      setRouteState((current) => ({
        ...current,
        loading: false,
        error: error.message || "Unable to optimize route",
      }));
    }
  }

  async function runScenario() {
    if (!selectedShipment || !onSimulateScenario) {
      return;
    }

    setScenarioState({ loading: true, error: "", result: null });
    try {
      const result = await onSimulateScenario({
        shipment_id: selectedShipment.id,
        ...scenario,
      });
      setScenarioState({ loading: false, error: "", result });
    } catch (error) {
      setScenarioState({
        loading: false,
        error: error.message || "Unable to simulate disruption scenario.",
        result: null,
      });
    }
  }

  if (loading && !selectedShipment) {
    return <PageSkeleton />;
  }

  if (!selectedShipment) {
    return (
      <div className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <p className="eyebrow">Route Intelligence</p>
            <h1>Select a shipment to review live routing, progress, and optimization options.</h1>
          </div>
          <div className="toolbar">
            <button type="button" onClick={onBack}>Back to Shipment Control</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Route Intelligence</p>
          <h1>{selectedShipment.tracking_number} from {selectedShipment.origin} to {selectedShipment.destination}</h1>
          <p>Monitor completed distance, remaining path, ETA variance, and route alternatives for this shipment.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onBack}>Back to Shipment Control</button>
        </div>

        <MapContainer
          key={selectedShipment.id}
          center={[Number(selectedShipment.current_coords.lat), Number(selectedShipment.current_coords.lng)]}
          zoom={4}
          className="map-frame"
        >
          <TrackingViewport shipmentId={selectedShipment.id} bounds={trackingBounds} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline
            positions={[
              [Number(selectedShipment.origin_coords.lat), Number(selectedShipment.origin_coords.lng)],
              [Number(selectedShipment.destination_coords.lat), Number(selectedShipment.destination_coords.lng)],
            ]}
            pathOptions={{ color: "#334155", weight: 4, opacity: 0.4 }}
          />
          <Polyline
            positions={[
              [Number(selectedShipment.origin_coords.lat), Number(selectedShipment.origin_coords.lng)],
              [Number(selectedShipment.current_coords.lat), Number(selectedShipment.current_coords.lng)],
            ]}
            pathOptions={{ color: STATUS_COLORS[selectedShipment.status] || "#38bdf8", weight: 6 }}
          />
          <Polyline
            positions={[
              [Number(selectedShipment.current_coords.lat), Number(selectedShipment.current_coords.lng)],
              [Number(selectedShipment.destination_coords.lat), Number(selectedShipment.destination_coords.lng)],
            ]}
            pathOptions={{ color: "#cbd5e1", weight: 4, dashArray: "8 10", className: "map-route" }}
          />
          <CircleMarker
            center={[Number(selectedShipment.origin_coords.lat), Number(selectedShipment.origin_coords.lng)]}
            radius={8}
            pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1 }}
          >
            <Popup>{selectedShipment.origin}</Popup>
          </CircleMarker>
          <CircleMarker
            center={[Number(selectedShipment.current_coords.lat), Number(selectedShipment.current_coords.lng)]}
            radius={10}
            pathOptions={{ color: STATUS_COLORS[selectedShipment.status] || "#38bdf8", fillColor: STATUS_COLORS[selectedShipment.status] || "#38bdf8", fillOpacity: 1 }}
          >
            <Popup>Current live shipment position</Popup>
          </CircleMarker>
          <CircleMarker
            center={[Number(selectedShipment.destination_coords.lat), Number(selectedShipment.destination_coords.lng)]}
            radius={8}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
          >
            <Popup>{selectedShipment.destination}</Popup>
          </CircleMarker>
        </MapContainer>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <h2>Tracking Overview</h2>
            <p>Review shipment execution, ETA performance, and active operational risk.</p>
          </div>
          <div className="info-grid">
            <div><span>Status</span><strong>{selectedShipment.status}</strong></div>
            <div><span>Progress</span><strong>{formatPercent(selectedShipment.progress_pct)}</strong></div>
            <div><span>ETA</span><strong>{formatDateTime(selectedShipment.estimated_arrival)}</strong></div>
            <div><span>Predicted ETA</span><strong>{formatDateTime(getPredictedEta(selectedShipment))}</strong></div>
            <div><span>Delay</span><strong>{selectedShipment.delay_minutes} min</strong></div>
            <div><span>Risk</span><strong>{Math.round(Number(selectedShipment.risk_score || 0) * 100)}%</strong></div>
            <div><span>Model Confidence</span><strong>{getConfidencePercent(selectedShipment)}</strong></div>
            <div><span>Carrier</span><strong>{selectedShipment.carrier}</strong></div>
          </div>
          <div className="progress-track progress-track--lg">
            <div className="progress-track__bar progress-track__bar--animated" style={{ width: `${Number(selectedShipment.progress_pct || 0)}%` }} />
          </div>
          <div className="timeline">
            {timeline.map((item) => (
              <div key={item.label} className={`timeline__item timeline__item--${item.state}`}>
                <span className="timeline__dot" />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-heading">
            <h2>Cost Breakdown</h2>
            <p>Estimated spend based on shipment progress, operating mode, and delay exposure.</p>
          </div>
          <div className="info-grid">
            <div><span>Total Estimated</span><strong>{Math.round(cost.total).toLocaleString()} USD</strong></div>
            <div><span>Cost Incurred</span><strong>{Math.round(cost.incurred).toLocaleString()} USD</strong></div>
            <div><span>Remaining</span><strong>{Math.round(cost.remaining).toLocaleString()} USD</strong></div>
            <div><span>Delay Penalty</span><strong>{Math.round(selectedShipment.delay_minutes * 12).toLocaleString()} USD</strong></div>
          </div>
          {selectedShipment.ml_prediction?.anomaly_detected ? (
            <div className="banner banner--warning">
              The ML model marked this shipment for extreme-risk escalation.
            </div>
          ) : null}
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Route Optimizer</h2>
          <p>Compare the fastest, cheapest, and safest route options for the current destination.</p>
        </div>
        <div className="toolbar">
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="fastest">Fastest</option>
            <option value="cheapest">Cheapest</option>
            <option value="safest">Safest</option>
          </select>
          <button type="button" onClick={optimize} disabled={routeState.loading}>
            {routeState.loading ? "Evaluating routes..." : "Generate route options"}
          </button>
        </div>
        {routeState.error ? <div className="banner banner--warning">{routeState.error}</div> : null}
        <div className="content-grid content-grid--three">
          {routeState.routes.map((route, index) => (
            <article
              key={route.id}
              className={`route-option ${routeState.selectedRouteId === route.id ? "route-option--selected" : ""}`}
              onClick={() => setRouteState((current) => ({ ...current, selectedRouteId: route.id }))}
            >
              <div className="route-option__header">
                <strong>{route.label}</strong>
                <span>{index === 0 ? "Recommended" : "Alternative"}</span>
              </div>
              <p>{route.description}</p>
              <div className="route-option__metrics">
                <span>{route.estimated_hours} hrs</span>
                <span>{route.distance_km} km</span>
                <span>{Math.round(Number(route.risk_score || 0) * 100)}% risk</span>
                <span>{formatFractionPercent(route.confidence)}</span>
              </div>
              <div className="route-option__metrics">
                <span>{Math.round(Number(route.cost_usd || 0)).toLocaleString()} USD</span>
                <span>{(route.tags || []).join(" · ")}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Scenario Simulation</h2>
          <p>Model the impact of weather, congestion, and delay shocks before rerouting.</p>
        </div>
        <div className="content-grid content-grid--three">
          <label>
            Weather Delta
            <input
              type="number"
              step="0.05"
              min="-1"
              max="1"
              value={scenario.weather_delta}
              onChange={(event) => setScenario((current) => ({ ...current, weather_delta: Number(event.target.value) }))}
            />
          </label>
          <label>
            Congestion Delta
            <input
              type="number"
              step="0.05"
              min="-1"
              max="1"
              value={scenario.congestion_delta}
              onChange={(event) => setScenario((current) => ({ ...current, congestion_delta: Number(event.target.value) }))}
            />
          </label>
          <label>
            Delay Delta Minutes
            <input
              type="number"
              step="5"
              min="-720"
              max="720"
              value={scenario.delay_delta_minutes}
              onChange={(event) => setScenario((current) => ({ ...current, delay_delta_minutes: Number(event.target.value) }))}
            />
          </label>
        </div>
        <div className="toolbar">
          <button type="button" onClick={runScenario} disabled={scenarioState.loading}>
            {scenarioState.loading ? "Simulating..." : "Run what-if scenario"}
          </button>
        </div>
        {scenarioState.error ? <div className="banner banner--warning">{scenarioState.error}</div> : null}
        {scenarioState.result ? (
          <div className="info-grid">
            <div><span>Baseline Risk</span><strong>{Math.round(Number(scenarioState.result.baseline_risk || 0) * 100)}%</strong></div>
            <div><span>Simulated Risk</span><strong>{Math.round(Number(scenarioState.result.simulated_risk || 0) * 100)}%</strong></div>
            <div><span>Risk Delta</span><strong>{Math.round(Number(scenarioState.result.risk_delta || 0) * 100)} pts</strong></div>
            <div><span>Baseline ETA</span><strong>{scenarioState.result.baseline_eta || "N/A"}</strong></div>
            <div><span>Simulated ETA</span><strong>{scenarioState.result.simulated_eta || "N/A"}</strong></div>
            <div><span>Top Factors</span><strong>{(scenarioState.result.top_factors || []).slice(0, 2).join(", ") || "N/A"}</strong></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
