import ProgressBar from "./ProgressBar.jsx";
import RiskBar from "./RiskBar.jsx";
import StatusBadge from "./StatusBadge.jsx";
import {
  formatDelay,
  formatETA,
  getDelayColor,
  getModeTone,
} from "../lib/utils.js";

export default function ShipmentRow({ canDelete = false, onDeleteRequest, onOpenDetails, onOpenTracking, shipment }) {
  const riskPercent = Math.round(Number(shipment.risk_score || 0) * 100);
  const progressPercent = Math.round(Number(shipment.progress_pct || 0));
  const delayText = formatDelay(shipment.delay_minutes);
  const modeTone = getModeTone(shipment.mode);

  return (
    <article className="shipment-grid-row">
      <div className="shipment-cell shipment-cell--tracking">
        <button type="button" className="shipment-link" onClick={() => onOpenDetails(shipment)}>
          {shipment.tracking_number}
        </button>
        <p>{shipment.cargo_type || shipment.customer || "General Cargo"}</p>
      </div>

      <div className="shipment-cell shipment-cell--route">
        <strong>{shipment.origin} <span aria-hidden="true">→</span> {shipment.destination}</strong>
        <p>End-to-end shipment corridor</p>
      </div>

      <div className="shipment-cell shipment-cell--carrier">
        <span className="carrier-chip" aria-hidden="true">
          {String(shipment.carrier || "?").slice(0, 1)}
        </span>
        <div>
          <strong>{shipment.carrier}</strong>
          <p>Primary operating carrier</p>
        </div>
      </div>

      <div className="shipment-cell">
        <span className={`mode-pill mode-pill--${modeTone}`}>{shipment.mode}</span>
      </div>

      <div className="shipment-cell shipment-cell--eta">
        <strong>{formatETA(shipment.estimated_arrival)}</strong>
        <p style={{ color: getDelayColor(shipment.delay_minutes) }}>{delayText}</p>
      </div>

      <div className="shipment-cell">
        <StatusBadge status={shipment.status} />
      </div>

      <div className="shipment-cell shipment-cell--metric">
        <RiskBar riskPercent={riskPercent} />
      </div>

      <div className="shipment-cell shipment-cell--metric">
        <ProgressBar progressPercent={progressPercent} />
      </div>

      <div className="shipment-cell shipment-cell--action">
        <button type="button" className="ghost-button shipment-action shipment-action--outline" onClick={() => onOpenDetails(shipment)}>
          Details
        </button>
      </div>

      <div className="shipment-cell shipment-cell--action">
        <button type="button" className="shipment-action shipment-action--primary" onClick={() => onOpenTracking(shipment)}>
          Track
        </button>
      </div>

      {canDelete ? (
        <div className="shipment-cell shipment-cell--action">
          <button type="button" className="shipment-action shipment-action--danger" onClick={() => onDeleteRequest(shipment)}>
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}
