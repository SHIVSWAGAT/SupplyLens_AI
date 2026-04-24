import { getRiskColor } from "../lib/utils.js";

export default function RiskBar({ riskPercent }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(riskPercent || 0))));

  return (
    <div className="metric-bar metric-bar--risk">
      <div className="metric-bar__track">
        <div
          className="metric-bar__fill"
          style={{
            width: `${value}%`,
            background: getRiskColor(value),
          }}
        />
      </div>
      <span className="metric-bar__value" title={`Risk score ${value}%`}>{value}%</span>
    </div>
  );
}
