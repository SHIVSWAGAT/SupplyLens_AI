export default function ProgressBar({ progressPercent }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(progressPercent || 0))));

  return (
    <div className="metric-bar metric-bar--progress">
      <div className="metric-bar__track">
        <div
          className="metric-bar__fill metric-bar__fill--blue"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="metric-bar__value">{value}%</span>
    </div>
  );
}
