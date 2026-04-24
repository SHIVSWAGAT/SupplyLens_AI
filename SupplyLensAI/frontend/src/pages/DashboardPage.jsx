import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import KpiCard from "../components/KpiCard.jsx";
import { PageSkeleton } from "../components/Skeletons.jsx";
import {
  buildAiInsights,
  buildStatusData,
  formatDateTime,
  normalizeAlerts,
  WEATHER_SEVERITY_COLORS,
} from "../lib/utils.js";

export default function DashboardPage({
  alerts,
  aiInsights,
  kpis,
  loading,
  onNavigate,
  shipments,
  stats,
  trends,
  weatherAdvisories,
  weatherCities,
}) {
  const [trendView, setTrendView] = useState("bar");
  const statusData = buildStatusData(stats, shipments);
  const insights = useMemo(
    () => buildAiInsights({ kpis, shipments, weatherAdvisories, weatherCities }),
    [kpis, shipments, weatherAdvisories, weatherCities],
  );
  const recentAlerts = normalizeAlerts(alerts, weatherAdvisories, shipments).slice(0, 6);
  const weatherHighlights = [...weatherCities]
    .sort((left, right) => Number(right.risk_score || 0) - Number(left.risk_score || 0))
    .slice(0, 4);

  if (loading && !shipments.length) {
    return <PageSkeleton />;
  }

  return (
    <div className="page-grid">
      <section className="hero-card hero-card--dashboard">
        <div className="section-heading">
          <p className="eyebrow">Overview</p>
          <h1>Shipment Performance Snapshot</h1>
          <p>Monitor SLA adherence, route exposure, and active exceptions across the shipment network.</p>
        </div>
        <div className="metric-grid metric-grid--hero">
          <KpiCard
            detail={`${stats?.total || shipments.length} active shipments in scope`}
            label="Total Shipments"
            tooltip="Total shipments currently represented in the control tower dataset."
            value={kpis?.total_shipments ?? shipments.length}
          />
          <KpiCard
            detail={`ETA accuracy at ${Number(kpis?.eta_accuracy_pct || 0).toFixed(1)}%`}
            label="On-Time Delivery Rate"
            tone="success"
            tooltip="Share of shipments delivered on or before expected arrival, or still projected to arrive on time."
            type="percent"
            value={kpis?.on_time_pct}
          />
          <KpiCard
            detail={`${weatherAdvisories.length} live weather advisories in effect`}
            label="Active Alerts"
            tone="warning"
            tooltip="Open shipment alerts that still require operational review or acknowledgement."
            value={kpis?.active_alerts ?? alerts.length}
          />
          <KpiCard
            detail={`${kpis?.disruptions_prevented ?? 0} disruption interventions prevented`}
            label="Cost Savings"
            tone="accent"
            tooltip="Estimated savings captured through intervention and route optimization actions."
            type="currency"
            value={kpis?.cost_savings_usd}
          />
        </div>
      </section>

      <section className="content-grid content-grid--three">
        <article className="panel panel--glow">
          <div className="section-heading">
            <h2>Shipment Status Donut</h2>
            <p>Current distribution of on-time, at-risk, delayed, and critical shipments.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={80} outerRadius={120} paddingAngle={4}>
                {statusData.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </article>

        <article className="panel panel--glow panel--span-2">
          <div className="section-heading">
            <h2>Monthly Delivery Trend</h2>
            <p>Review the last six months of on-time, delayed, and critical shipment volume.</p>
          </div>
          <div className="toolbar">
            <button type="button" className={trendView === "bar" ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => setTrendView("bar")}>
              Bar
            </button>
            <button type="button" className={trendView === "line" ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => setTrendView("line")}>
              Line
            </button>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            {trendView === "bar" ? (
              <BarChart data={trends}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="month" stroke="#94a3b8" interval={0} />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="on_time" fill="#22c55e" radius={[10, 10, 0, 0]} />
                <Bar dataKey="delayed" fill="#f59e0b" radius={[10, 10, 0, 0]} />
                <Bar dataKey="critical" fill="#ef4444" radius={[10, 10, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={trends}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="month" stroke="#94a3b8" interval={0} />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="on_time" stroke="#22c55e" fill="rgba(34, 197, 94, 0.22)" />
                <Area type="monotone" dataKey="delayed" stroke="#f59e0b" fill="rgba(245, 158, 11, 0.22)" />
                <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="rgba(239, 68, 68, 0.22)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <h2>Live Weather Exposure</h2>
            <p>Track the cities creating the highest current route and ETA risk.</p>
          </div>
          <div className="weather-strip">
            {weatherHighlights.map((city) => (
              <article key={city.city} className="weather-highlight">
                <div className="weather-highlight__header">
                  <strong>{city.city}</strong>
                  <span style={{ color: WEATHER_SEVERITY_COLORS[city.risk_level] || "#94a3b8" }}>
                    {city.icon}
                  </span>
                </div>
                <p>{city.description}</p>
                <div className="weather-highlight__meta">
                  <span>{city.temp}°C</span>
                  <span>{city.wind} km/h</span>
                  <span>Risk {city.risk_score}/100</span>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-heading">
            <h2>AI Insights Panel</h2>
            <p>Operational recommendations generated from ML risk predictions, live alerts, and route economics.</p>
          </div>
          <div className="insight-list">
            {insights.map((insight) => (
              <article key={insight} className="insight-card">
                <p>{insight}</p>
              </article>
            ))}
            {(aiInsights?.top_risky_shipments || []).slice(0, 3).map((shipment) => (
              <article key={shipment.tracking_number} className="insight-card">
                <p>
                  <strong>{shipment.tracking_number}</strong> is trending high risk at {Math.round(Number(shipment.risk_score || 0) * 100)}%
                  with ETA {shipment.predicted_eta || "pending"}.
                </p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <h2>Alerts Preview</h2>
            <p>Review the latest disruption alerts and open the alert workspace for action.</p>
          </div>
          <div className="list-stack">
            {recentAlerts.map((alert) => (
              <button
                type="button"
                key={alert.id}
                className={`alert-card alert-card--interactive alert-card--${String(alert.severity || alert.color || "info").toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => onNavigate("alerts")}
              >
                <div className="alert-card__header">
                  <strong>{alert.title}</strong>
                  <span>{alert.risk_level || alert.severity || "Info"}</span>
                </div>
                <p>{alert.message}</p>
                <small>{formatDateTime(alert.timestamp)}</small>
              </button>
            ))}
            {!recentAlerts.length ? <p className="empty-state">No active alerts require action right now.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="section-heading">
            <h2>Fleet Snapshot</h2>
            <p>Prioritize shipments with the highest risk exposure and execution variance.</p>
          </div>
          <div className="list-stack">
            {[...shipments]
              .sort((left, right) => Number(right.risk_score || 0) - Number(left.risk_score || 0))
              .slice(0, 6)
              .map((shipment) => (
                <div key={shipment.id} className="shipment-summary">
                  <div>
                    <strong>{shipment.tracking_number}</strong>
                    <p>{shipment.origin} to {shipment.destination}</p>
                  </div>
                  <div className="shipment-summary__meta">
                    <span>{shipment.status}</span>
                    <span>{Math.round(Number(shipment.risk_score || 0) * 100)}%</span>
                  </div>
                </div>
              ))}
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <h2>Predicted Disruptions</h2>
            <p>Shipments with elevated ML risk or an extreme-risk escalation flag.</p>
          </div>
          <div className="list-stack">
            {(aiInsights?.predicted_disruptions || []).map((item) => (
              <div key={item.tracking_number} className="shipment-summary">
                <div>
                  <strong>{item.tracking_number}</strong>
                  <p>{item.anomaly_detected ? "Extreme-risk escalation" : "High predicted disruption risk"}</p>
                </div>
                <div className="shipment-summary__meta">
                  <span>{Math.round(Number(item.risk_score || 0) * 100)}%</span>
                </div>
              </div>
            ))}
            {!aiInsights?.predicted_disruptions?.length ? <p className="empty-state">No predicted disruptions exceed the current action threshold.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="section-heading">
            <h2>Cost Savings Suggestions</h2>
            <p>Route shifts with the best near-term savings opportunity based on live alternatives.</p>
          </div>
          <div className="list-stack">
            {(aiInsights?.cost_savings_suggestions || []).map((item) => (
              <div key={item.tracking_number} className="shipment-summary">
                <div>
                  <strong>{item.tracking_number}</strong>
                  <p>Current {Math.round(Number(item.current_cost || 0)).toLocaleString()} USD vs best {Math.round(Number(item.best_available_cost || 0)).toLocaleString()} USD</p>
                </div>
                <div className="shipment-summary__meta">
                  <span>{Math.round(Number(item.savings || 0)).toLocaleString()} USD</span>
                </div>
              </div>
            ))}
            {!aiInsights?.cost_savings_suggestions?.length ? <p className="empty-state">No route-cost arbitrage opportunities are currently material.</p> : null}
          </div>
        </article>
      </section>
    </div>
  );
}
