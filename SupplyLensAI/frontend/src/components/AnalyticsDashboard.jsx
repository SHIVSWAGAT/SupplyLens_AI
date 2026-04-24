import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#38bdf8", "#22c55e", "#fb7185", "#f59e0b", "#2dd4bf", "#a78bfa"];

export default function AnalyticsDashboard({ carriers, regions, trends }) {
  return (
    <div className="chart-grid">
      <div className="chart-card">
        <h3>Monthly Trends</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trends}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 4" />
            <XAxis dataKey="month" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="on_time" stroke="#22c55e" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="delayed" stroke="#f59e0b" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="critical" stroke="#fb7185" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Carrier Performance</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={carriers}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 4" />
            <XAxis dataKey="carrier" stroke="#94a3b8" interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis stroke="#94a3b8" />
            <Tooltip />
            <Legend />
            <Bar dataKey="on_time_pct" fill="#38bdf8" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Regional Disruptions</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={regions}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 4" />
            <XAxis dataKey="region" stroke="#94a3b8" interval={0} angle={-12} textAnchor="end" height={70} />
            <YAxis stroke="#94a3b8" />
            <Tooltip />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {regions.map((region, index) => (
                <Cell
                  key={`${region.region}-${region.severity}`}
                  fill={region.severity === "Critical" ? "#fb7185" : region.severity === "Warning" ? "#f59e0b" : CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card chart-card--table">
        <h3>Carrier Detail</h3>
        <div className="table-list">
          {carriers.map((carrier) => (
            <div key={carrier.carrier} className="table-row">
              <span>{carrier.carrier}</span>
              <span>{Number(carrier.on_time_pct || 0).toFixed(1)}%</span>
              <span>{carrier.total_shipments} shipments</span>
              <span>{Number(carrier.avg_delay || 0).toFixed(1)} min delay</span>
            </div>
          ))}
          {!carriers.length ? <p className="empty-state">No carrier data available.</p> : null}
        </div>
      </div>
    </div>
  );
}
