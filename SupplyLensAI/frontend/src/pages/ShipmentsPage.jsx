import { useMemo, useState } from "react";

import FiltersBar from "../components/FiltersBar.jsx";
import Modal from "../components/Modal.jsx";
import ShipmentTable from "../components/ShipmentTable.jsx";
import { PageSkeleton } from "../components/Skeletons.jsx";
import {
  calculateShipmentCost,
  formatDateTime,
  formatPercent,
  getConfidencePercent,
  getPredictedEta,
} from "../lib/utils.js";

const SORT_OPTIONS = [
  { value: "eta", label: "ETA" },
  { value: "risk", label: "Risk Score" },
  { value: "delay", label: "Delay" },
];

export default function ShipmentsPage({
  canDeleteShipment,
  loading,
  onDeleteShipment,
  onLoadAnalysis,
  onOpenTracking,
  shipments,
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("eta");
  const [statusFilter, setStatusFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [modeFilter, setModeFilter] = useState("All");
  const [detailsState, setDetailsState] = useState({
    analysis: null,
    loading: false,
    shipment: null,
  });
  const [deleteState, setDeleteState] = useState({
    error: "",
    loading: false,
    shipment: null,
  });

  const filteredShipments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...shipments]
      .filter((shipment) => {
        if (statusFilter !== "All" && shipment.status !== statusFilter) {
          return false;
        }

        if (modeFilter !== "All" && shipment.mode !== modeFilter) {
          return false;
        }

        if (riskFilter !== "All") {
          const riskScore = Number(shipment.risk_score || 0);
          if (riskFilter === "low" && riskScore >= 0.25) {
            return false;
          }
          if (riskFilter === "moderate" && (riskScore < 0.25 || riskScore >= 0.5)) {
            return false;
          }
          if (riskFilter === "high" && (riskScore < 0.5 || riskScore >= 0.75)) {
            return false;
          }
          if (riskFilter === "critical" && riskScore < 0.75) {
            return false;
          }
        }

        if (!query) {
          return true;
        }

        return [
          shipment.tracking_number,
          shipment.cargo_type,
          shipment.origin,
          shipment.destination,
          shipment.carrier,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        if (sortBy === "risk") {
          return Number(right.risk_score || 0) - Number(left.risk_score || 0);
        }
        if (sortBy === "delay") {
          return Number(right.delay_minutes || 0) - Number(left.delay_minutes || 0);
        }
        return String(left.estimated_arrival || "").localeCompare(String(right.estimated_arrival || ""));
      });
  }, [modeFilter, riskFilter, search, shipments, sortBy, statusFilter]);

  async function openDetails(shipment) {
    setDetailsState({ shipment, analysis: null, loading: true });
    try {
      const analysis = await onLoadAnalysis(shipment.id);
      setDetailsState({ shipment, analysis, loading: false });
    } catch (error) {
      setDetailsState({
        shipment,
        analysis: {
          factors: [],
          recommendations: [error.message || "Shipment risk factors are temporarily unavailable."],
        },
        loading: false,
      });
    }
  }

  async function confirmDeleteShipment() {
    if (!deleteState.shipment || deleteState.loading) {
      return;
    }

    const shipment = deleteState.shipment;
    setDeleteState((current) => ({ ...current, error: "", loading: true }));

    try {
      await onDeleteShipment(shipment);
      setDeleteState({ error: "", loading: false, shipment: null });
      if (detailsState.shipment?.id === shipment.id) {
        setDetailsState({ shipment: null, analysis: null, loading: false });
      }
    } catch (error) {
      setDeleteState((current) => ({
        ...current,
        error: error.message || "Unable to delete the shipment.",
        loading: false,
      }));
    }
  }

  if (loading && !shipments.length) {
    return <PageSkeleton />;
  }

  return (
    <div className="page-grid">
      <section className="panel shipment-control-panel">
        <div className="shipment-control-header">
          <div className="section-heading">
            <p className="eyebrow">Shipments</p>
            <h1>Shipment Network View</h1>
            <p>Monitor ML-based delay risk, ETA variance, progress, and live shipment status in one table.</p>
          </div>

          <div className="shipment-control-actions">
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <FiltersBar
          modeFilter={modeFilter}
          onModeChange={setModeFilter}
          onRiskChange={setRiskFilter}
          onSearchChange={setSearch}
          onStatusChange={setStatusFilter}
          riskFilter={riskFilter}
          search={search}
          statusFilter={statusFilter}
        />

        <div className="shipment-table-helper">
          <span>{filteredShipments.length} shipments matched</span>
          <span>Tracking IDs open shipment details. Track actions open live map routing.</span>
        </div>

        {filteredShipments.length ? (
          <ShipmentTable
            canDelete={canDeleteShipment}
            onDeleteRequest={(shipment) => setDeleteState({ error: "", loading: false, shipment })}
            onOpenDetails={openDetails}
            onOpenTracking={onOpenTracking}
            shipments={filteredShipments}
          />
        ) : (
          <p className="empty-state">No shipments match the selected filters. Adjust the search or filter criteria to continue.</p>
        )}
      </section>

      {detailsState.shipment ? (
        <Modal
          title={`Shipment ${detailsState.shipment.tracking_number}`}
          onClose={() => setDetailsState({ shipment: null, analysis: null, loading: false })}
        >
          <div className="detail-stack">
            <div className="info-grid">
              <div><span>Shipment Status</span><strong>{detailsState.shipment.status}</strong></div>
              <div><span>Risk Score</span><strong>{Math.round(Number(detailsState.shipment.risk_score || 0) * 100)}%</strong></div>
              <div><span>Predicted ETA</span><strong>{formatDateTime(getPredictedEta(detailsState.shipment))}</strong></div>
              <div><span>Model Confidence</span><strong>{getConfidencePercent(detailsState.shipment)}</strong></div>
              <div><span>Shipment Progress</span><strong>{formatPercent(detailsState.shipment.progress_pct)}</strong></div>
              <div><span>Delay Variance</span><strong>{detailsState.shipment.delay_minutes} min</strong></div>
              <div><span>Operating Carrier</span><strong>{detailsState.shipment.carrier}</strong></div>
              <div><span>Transport Mode</span><strong>{detailsState.shipment.mode}</strong></div>
            </div>

            <article className="route-option">
              <div className="route-option__header">
                <strong>Shipment Commercial Summary</strong>
                <span>{detailsState.shipment.customer}</span>
              </div>
              <div className="route-option__metrics">
                <span>Total estimated cost {Math.round(calculateShipmentCost(detailsState.shipment).total).toLocaleString()} USD</span>
                <span>ETA {formatDateTime(detailsState.shipment.estimated_arrival)}</span>
                <span>Predicted ETA {formatDateTime(getPredictedEta(detailsState.shipment))}</span>
                <span>{detailsState.shipment.origin} to {detailsState.shipment.destination}</span>
              </div>
            </article>

            <article className="info-card">
              <div className="section-heading">
                <h3>AI Risk Assessment</h3>
                <p>Explainable shipment risk factors from the logistic regression delay model.</p>
              </div>
              {detailsState.loading ? (
                <p className="empty-state">Loading shipment risk assessment...</p>
              ) : (
                <>
                  <div className="factor-list">
                    {(detailsState.analysis?.factors || []).map((factor) => (
                      <div key={factor.factor} className="factor-row">
                        <span>{factor.icon} {factor.factor}</span>
                        <strong>{Math.round(Number(factor.value || 0) * 100)}%</strong>
                      </div>
                    ))}
                  </div>
                  {detailsState.shipment.ml_prediction?.anomaly_detected ? (
                    <div className="banner banner--warning">
                      This shipment crossed the model's extreme-risk escalation threshold.
                    </div>
                  ) : null}
                  <div className="list-stack">
                    {(detailsState.analysis?.recommendations || []).map((item) => (
                      <div key={item} className="recommendation-row">{item}</div>
                    ))}
                  </div>
                </>
              )}
            </article>
          </div>
        </Modal>
      ) : null}

      {deleteState.shipment ? (
        <Modal
          title="Delete Shipment?"
          onClose={() => !deleteState.loading && setDeleteState({ error: "", loading: false, shipment: null })}
        >
          <div className="detail-stack">
            <p className="confirm-copy">
              {deleteState.shipment.tracking_number} will be permanently removed from the active shipment workspace. This action cannot be undone.
            </p>
            {deleteState.error ? <div className="banner banner--danger">{deleteState.error}</div> : null}
            <div className="info-grid">
              <div><span>Route</span><strong>{deleteState.shipment.origin} to {deleteState.shipment.destination}</strong></div>
              <div><span>Carrier</span><strong>{deleteState.shipment.carrier}</strong></div>
            </div>
            <div className="action-row action-row--end">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDeleteState({ error: "", loading: false, shipment: null })}
                disabled={deleteState.loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button--danger"
                onClick={confirmDeleteShipment}
                disabled={deleteState.loading}
              >
                {deleteState.loading ? "Deleting..." : "Delete Shipment"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
