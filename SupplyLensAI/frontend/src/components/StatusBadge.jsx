import { getStatusColor, statusClassName } from "../lib/utils.js";

export default function StatusBadge({ status }) {
  return (
    <span
      className={`status-badge status-badge--${statusClassName(status)}`}
      style={{ "--status-color": getStatusColor(status) }}
    >
      {status}
    </span>
  );
}
