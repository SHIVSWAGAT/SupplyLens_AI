import { useMemo, useState } from "react";

import Modal from "../components/Modal.jsx";
import { PageSkeleton } from "../components/Skeletons.jsx";
import { formatDateTime, formatFractionPercent, normalizeAlerts } from "../lib/utils.js";

const FILTERS = ["Critical", "High", "Moderate"];

export default function AlertsPage({
  alerts,
  canAcknowledge,
  canRefreshWeather,
  loading,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onOptimizeRoute,
  onRefreshWeather,
  refreshingWeather,
  shipments,
  weatherAdvisories,
}) {
  const [activeFilter, setActiveFilter] = useState("Critical");
  const [dismissedIds, setDismissedIds] = useState([]);
  const [routePreview, setRoutePreview] = useState({ loading: false, routes: [], title: "", error: "" });

  const normalizedAlerts = useMemo(
    () => normalizeAlerts(alerts, weatherAdvisories, shipments).filter((alert) => !dismissedIds.includes(alert.id)),
    [alerts, weatherAdvisories, shipments, dismissedIds],
  );

  const filteredAlerts = useMemo(
    () => normalizedAlerts.filter((alert) => alert.risk_level === activeFilter),
    [activeFilter, normalizedAlerts],
  );

  const groupedAlerts = useMemo(() => {
    const groups = new Map();
    filteredAlerts.forEach((alert) => {
      const key = alert.shipment_id || alert.tracking_number;
      const bucket = groups.get(key) || [];
      bucket.push(alert);
      groups.set(key, bucket);
    });
    return [...groups.values()].map((group) => group.sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || ""))));
  }, [filteredAlerts]);

  async function optimizeAlert(alert) {
    const shipment = shipments.find((item) => item.id === alert.shipment_id || item.tracking_number === alert.tracking_number);
    if (!shipment) {
      setRoutePreview({
        loading: false,
        routes: [],
        title: "Route Optimization",
        error: "Shipment context unavailable for this alert.",
      });
      return;
    }

    setRoutePreview({ loading: true, routes: [], title: `Optimized Routes for ${shipment.tracking_number}`, error: "" });
    try {
      const routes = await onOptimizeRoute({
        origin: shipment.origin,
        destination: shipment.destination,
        priority: activeFilter === "Critical" ? "safest" : "fastest",
      });
      setRoutePreview({
        loading: false,
        routes,
        title: `Optimized Routes for ${shipment.tracking_number}`,
        error: "",
      });
    } catch (error) {
      setRoutePreview({
        loading: false,
        routes: [],
        title: `Optimized Routes for ${shipment.tracking_number}`,
        error: error.message || "Unable to optimize route.",
      });
    }
  }

  if (loading && !normalizedAlerts.length) {
    return <PageSkeleton />;
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Alerts</p>
          <h1>Shipment Alert Queue</h1>
          <p>Review ML-prioritized shipment alerts grouped by tracking number, route, risk, cause, and next best action.</p>
        </div>

        <div className="toolbar toolbar--responsive">
          {FILTERS.map((filter) => {
            const count = normalizedAlerts.filter((alert) => alert.risk_level === filter).length;
            return (
              <button
                type="button"
                key={filter}
                className={activeFilter === filter ? "filter-chip filter-chip--active" : "filter-chip"}
                onClick={() => setActiveFilter(filter)}
              >
                {filter} ({count})
              </button>
            );
          })}
          {canRefreshWeather ? (
            <button type="button" onClick={onRefreshWeather} disabled={refreshingWeather}>
              {refreshingWeather ? "Refreshing alerts..." : "Refresh weather-linked alerts"}
            </button>
          ) : null}
          {canAcknowledge ? (
            <button type="button" onClick={onAcknowledgeAll}>
              Acknowledge open alerts
            </button>
          ) : null}
        </div>

        <div className="list-stack">
          {groupedAlerts.map((group) => {
            const lead = group[0];
            return (
              <article key={lead.shipment_id || lead.id} className="panel panel--nested">
                <div className="alert-group__header">
                  <div>
                    <strong>{lead.title}</strong>
                    <p>{lead.route}</p>
                  </div>
                  <span className="badge">{lead.risk_level}</span>
                </div>
                <div className="info-grid">
                  <div><span>Shipment</span><strong>{lead.tracking_number}</strong></div>
                  <div><span>Affected City</span><strong>{lead.affected_city || "No data available"}</strong></div>
                  <div><span>Reason</span><strong>{lead.reason || "No data available"}</strong></div>
                  <div><span>Events</span><strong>{group.length}</strong></div>
                </div>

                <div className="list-stack">
                  {group.map((alert) => (
                    <article key={alert.id} className={`alert-card alert-card--${String(alert.risk_level || alert.severity || "info").toLowerCase().replace(/\s+/g, "-")}`}>
                      <div className="alert-card__header">
                        <strong>{alert.title}</strong>
                        <span>{alert.risk_level}</span>
                      </div>
                      <p>{alert.message}</p>
                      <p><strong>Action:</strong> {alert.recommended_action || "Review shipment details."}</p>
                      <small>{formatDateTime(alert.timestamp)}</small>
                      <div className="toolbar">
                        {canAcknowledge && !alert.acknowledged ? (
                          <button type="button" className="ghost-button" onClick={() => onAcknowledgeAlert(alert.id)}>
                            Mark acknowledged
                          </button>
                        ) : null}
                        <button type="button" className="ghost-button" onClick={() => setDismissedIds((current) => [...current, alert.id])}>
                          Remove from view
                        </button>
                        <button type="button" className="ghost-button" onClick={() => optimizeAlert(alert)}>
                          Review route options
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            );
          })}
          {!groupedAlerts.length ? <p className="empty-state">No data available for the selected alert filter.</p> : null}
        </div>
      </section>

      {(routePreview.loading || routePreview.routes.length || routePreview.error) ? (
        <Modal title={routePreview.title || "Route Optimization"} onClose={() => setRoutePreview({ loading: false, routes: [], title: "", error: "" })}>
          {routePreview.loading ? <p className="empty-state">Evaluating route alternatives...</p> : null}
          {routePreview.error ? <div className="banner banner--warning">{routePreview.error}</div> : null}
          <div className="content-grid content-grid--three">
            {routePreview.routes.map((route) => (
              <article key={route.id} className="route-option">
                <div className="route-option__header">
                  <strong>{route.label}</strong>
                  <span>{Math.round(Number(route.risk_score || 0) * 100)}%</span>
                </div>
                <p>{route.description}</p>
                <div className="route-option__metrics">
                  <span>{route.distance_km} km</span>
                  <span>{route.estimated_hours} hrs</span>
                  <span>{Math.round(Number(route.cost_usd || 0)).toLocaleString()} USD</span>
                  <span>{formatFractionPercent(route.confidence)}</span>
                </div>
              </article>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
