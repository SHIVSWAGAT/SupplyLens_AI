import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import { formatCurrency, formatPercent } from "../lib/utils.js";

export default function KpiCard({ detail, label, tone = "default", tooltip = "", type = "number", value }) {
  const animatedValue = useAnimatedNumber(value);
  const hasValue = value != null && !Number.isNaN(Number(value));

  function renderValue() {
    if (!hasValue) {
      return "No data available";
    }
    if (type === "currency") {
      return formatCurrency(animatedValue);
    }
    if (type === "percent") {
      return formatPercent(animatedValue);
    }
    return Math.round(animatedValue).toLocaleString();
  }

  return (
    <article className={`metric-card metric-card--${tone}`} title={tooltip || detail || ""}>
      <span>{label}</span>
      <strong>{renderValue()}</strong>
      <small>{detail}</small>
    </article>
  );
}
