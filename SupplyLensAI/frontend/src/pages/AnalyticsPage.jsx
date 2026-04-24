import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import KpiCard from "../components/KpiCard.jsx";
import { PageSkeleton } from "../components/Skeletons.jsx";
import { buildRiskBuckets } from "../lib/utils.js";

export default function AnalyticsPage({ carriers, kpis, loading, shipments, stats, trends }) {
  const [trendView, setTrendView] = useState("bar");
  const riskData = buildRiskBuckets(shipments);
  const escalations = shipments.filter((shipment) => shipment.ml_prediction?.anomaly_detected).length;
  const avgConfidence = shipments.length
    ? shipments.reduce((sum, shipment) => sum + Number(shipment.ml_prediction?.confidence || 0), 0) / shipments.length
    : 0;

  if (loading && !shipments.length) {
    return <PageSkeleton />;
  }

  return (
    <div className="page-grid">
      <section className="metric-grid">
        <KpiCard detail="Fleet-wide shipment SLA adherence" label="On-Time Delivery Rate" tone="success" tooltip="Delivered on-time shipments plus active shipments still projected to meet expected arrival." type="percent" value={kpis?.on_time_pct} />
        <KpiCard detail="Predicted versus actual arrival performance" label="ETA Accuracy" tooltip="Modelled ETA accuracy across the current operating dataset." type="percent" value={kpis?.eta_accuracy_pct} />
        <KpiCard detail="Savings captured through route intervention" label="Cost Savings" tone="accent" tooltip="Estimated financial benefit captured by optimization and intervention actions." type="currency" value={kpis?.cost_savings_usd} />
        <KpiCard detail="Exceptions avoided across the review period" label="Disruptions Prevented" tone="warning" tooltip="Count of disruptions that were mitigated or avoided through intervention." value={kpis?.disruptions_prevented} />
        <KpiCard detail="Extreme-risk shipments automatically escalated by the ML layer" label="Escalations" tone="warning" tooltip="Shipments whose live conditions cross the model's extreme-risk threshold." value={escalations} />
        <KpiCard detail="Average confidence of current risk and ETA predictions" label="Prediction Confidence" tooltip="Average confidence score across current ML predictions." type="percent" value={avgConfidence * 100} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Analytics</p>
          <h1>Network Performance Trends</h1>
          <p>Use historical shipment data to review service levels, carrier execution, and mode-level performance.</p>
        </div>
        <div className="toolbar">
          <button type="button" className={trendView === "bar" ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => setTrendView("bar")}>
            Bar Trend
          </button>
          <button type="button" className={trendView === "area" ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => setTrendView("area")}>
            Area Trend
          </button>
        </div>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <h2>6-Month Delivery Performance</h2>
            <p>Track six months of on-time, delayed, and critical shipment performance.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            {trendView === "bar" ? (
              <BarChart data={trends}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="4 4" />
                <XAxis dataKey="month" stroke="#94a3b8" interval={0} />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="on_time" fill="#22c55e" radius={[8, 8, 0, 0]} />
                <Bar dataKey="delayed" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                <Bar dataKey="critical" fill="#ef4444" radius={[8, 8, 0, 0]} />
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

        <article className="panel">
          <div className="section-heading">
            <h2>Carrier On-Time Performance</h2>
            <p>Compare on-time delivery execution across core carriers.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={carriers}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="4 4" />
              <XAxis dataKey="carrier" stroke="#94a3b8" interval={0} angle={-12} textAnchor="end" height={70} />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="on_time_pct" fill="#38bdf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Risk Score Distribution</h2>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={riskData}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="4 4" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {riskData.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Carrier Performance Breakdown</h2>
          <p>Detailed carrier view with shipment count, on-time rate, average delay, and risk score.</p>
        </div>
        <div className="table-stack">
          {carriers.map((carrier) => (
            <article key={carrier.carrier} className="shipment-table-row">
              <div>
                <strong>{carrier.carrier}</strong>
                <p>{carrier.total_shipments} shipments</p>
              </div>
              <div>
                <span>{Number(carrier.on_time_pct || 0).toFixed(1)}%</span>
                <small>{carrier.on_time_shipments || 0} on-time shipments</small>
              </div>
              <div>
                <span>{Number(carrier.avg_delay || 0).toFixed(1)} min</span>
                <small>{carrier.delayed_shipments || 0} delayed shipments</small>
              </div>
              <div>
                <span>{Math.round(Number(carrier.risk_score || 0) * 100)}%</span>
                <small>Risk score distribution</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>ML Prediction Coverage</h2>
          <p>Track predicted ETA, escalation flags, and top drivers for the highest-risk shipments.</p>
        </div>
        <div className="table-stack">
          {[...shipments]
            .sort((left, right) => Number(right.risk_score || 0) - Number(left.risk_score || 0))
            .slice(0, 6)
            .map((shipment) => (
              <article key={shipment.id} className="shipment-table-row">
                <div>
                  <strong>{shipment.tracking_number}</strong>
                  <p>{shipment.ml_prediction?.top_factors?.slice(0, 2).join(", ") || "Prediction factors pending"}</p>
                </div>
                <div>
                  <span>{Math.round(Number(shipment.risk_score || 0) * 100)}%</span>
                  <small>Predicted delay risk</small>
                </div>
                <div>
                  <span>{shipment.ml_prediction?.predicted_eta || shipment.estimated_arrival}</span>
                  <small>Predicted arrival</small>
                </div>
                <div>
                  <span>{shipment.ml_prediction?.anomaly_detected ? "Yes" : "No"}</span>
                  <small>Escalation flag</small>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
