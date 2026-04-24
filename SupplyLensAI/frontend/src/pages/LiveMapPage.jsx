import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import Modal from "../components/Modal.jsx";
import {
  calculateShipmentCost,
  computeMapCenter,
  formatDateTime,
  formatPercent,
  getConfidencePercent,
  getHighRiskShipments,
  hasCoordinates,
  getRiskColor,
  STATUS_COLORS,
  statusClassName,
} from "../lib/utils.js";

const STATUS_FILTERS = ["All", "On Time", "At Risk", "Delayed", "Critical"];

function MapViewport({ onZoomChange }) {
  const map = useMap();

  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  useEffect(() => {
    let frameId = 0;
    const timers = [];
    let observer = null;

    const refreshSize = () => {
      map.invalidateSize(true);
    };

    refreshSize();
    frameId = window.requestAnimationFrame(refreshSize);
    timers.push(window.setTimeout(refreshSize, 150));
    timers.push(window.setTimeout(refreshSize, 450));

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(refreshSize);
      observer.observe(map.getContainer());
    }

    const onWindowResize = () => refreshSize();
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener("resize", onWindowResize);
    };
  }, [map]);

  return null;
}

function createShipmentIcon(status, count = 1) {
  const color = STATUS_COLORS[status] || "#94a3b8";
  const size = count > 1 ? 42 : 28;
  const className = count > 1 ? "map-marker map-marker--cluster" : `map-marker map-marker--pulse map-marker--${statusClassName(status)}`;
  return L.divIcon({
    className: "map-marker-shell",
    html: `<span class="${className}" style="--marker-color:${color}; width:${size}px; height:${size}px;">${count > 1 ? count : ""}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function buildClusters(shipments, zoom) {
  const precision = zoom >= 8 ? 10 : zoom >= 6 ? 5 : zoom >= 4 ? 2 : 1;
  const buckets = new Map();

  shipments.forEach((shipment) => {
    if (!hasCoordinates(shipment.current_coords)) {
      return;
    }

    const lat = Number(shipment.current_coords.lat);
    const lng = Number(shipment.current_coords.lng);
    const key = `${Math.round(lat * precision) / precision}:${Math.round(lng * precision) / precision}`;
    const bucket = buckets.get(key) || [];
    bucket.push(shipment);
    buckets.set(key, bucket);
  });

  return [...buckets.values()].map((group) => {
    const lat = group.reduce((sum, shipment) => sum + Number(shipment.current_coords.lat), 0) / group.length;
    const lng = group.reduce((sum, shipment) => sum + Number(shipment.current_coords.lng), 0) / group.length;
    const priorityOrder = ["On Time", "At Risk", "Delayed", "Critical"];
    const highestStatus = [...group]
      .sort((left, right) => priorityOrder.indexOf(right.status) - priorityOrder.indexOf(left.status))[0]
      ?.status;

    return {
      id: group.map((shipment) => shipment.id).join("_"),
      lat,
      lng,
      shipments: group,
      status: highestStatus || "On Time",
    };
  });
}

export default function LiveMapPage({ loading, shipments }) {
  const [filter, setFilter] = useState("All");
  const [zoomLevel, setZoomLevel] = useState(3);
  const [selectedShipment, setSelectedShipment] = useState(null);

  const filteredShipments = useMemo(
    () => (filter === "All" ? shipments : shipments.filter((shipment) => shipment.status === filter)),
    [filter, shipments],
  );
  const highRiskShipments = useMemo(() => getHighRiskShipments(shipments), [shipments]);
  const mapCenter = useMemo(
    () => computeMapCenter(filteredShipments.length ? filteredShipments : shipments),
    [filteredShipments, shipments],
  );
  const clusters = useMemo(() => buildClusters(filteredShipments, zoomLevel), [filteredShipments, zoomLevel]);

  return (
    <div className="content-grid live-map-layout">
      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Tracking</p>
          <h1>Live Shipment Map</h1>
          <p>Filter the fleet by operating status and focus on high-risk shipments that need intervention first.</p>
        </div>
        <div className="filter-bar">
          {STATUS_FILTERS.map((status) => (
            <button
              type="button"
              key={status}
              className={`filter-chip ${filter === status ? "filter-chip--active" : ""}`}
              onClick={() => setFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
        <MapContainer
          key={filter}
          center={mapCenter}
          zoom={3}
          minZoom={2}
          scrollWheelZoom
          className="map-frame"
        >
          <MapViewport onZoomChange={setZoomLevel} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filteredShipments.slice(0, 16).map((shipment) => (
            hasCoordinates(shipment.origin_coords) && hasCoordinates(shipment.current_coords) && hasCoordinates(shipment.destination_coords) ? (
              <Polyline
                key={`route-${shipment.id}`}
                positions={[
                  [Number(shipment.origin_coords.lat), Number(shipment.origin_coords.lng)],
                  [Number(shipment.current_coords.lat), Number(shipment.current_coords.lng)],
                  [Number(shipment.destination_coords.lat), Number(shipment.destination_coords.lng)],
                ]}
                pathOptions={{
                  color: getRiskColor(Number(shipment.risk_score || 0) * 100),
                  opacity: 0.25,
                  weight: 2,
                  dashArray: "8 12",
                  className: "map-route",
                }}
              />
            ) : null
          ))}
          {clusters.map((cluster) => (
            <Marker
              key={cluster.id}
              position={[cluster.lat, cluster.lng]}
              icon={createShipmentIcon(cluster.status, cluster.shipments.length)}
              eventHandlers={{
                click: () => {
                  if (cluster.shipments.length === 1) {
                    setSelectedShipment(cluster.shipments[0]);
                  }
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} opacity={1}>
                {cluster.shipments.length === 1
                  ? `${cluster.shipments[0].tracking_number} • ${cluster.shipments[0].status}`
                  : `${cluster.shipments.length} shipments clustered`}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
        {loading ? <div className="loading-inline">Updating shipment positions...</div> : null}
      </section>

      <aside className="panel side-panel">
        <div className="section-heading">
          <h2>High Risk Shipments</h2>
          <p>Shipments with the highest current risk score across the active network.</p>
        </div>
        <div className="list-stack">
          {highRiskShipments.map((shipment) => (
            <button
              type="button"
              key={shipment.id}
              className="shipment-summary shipment-summary--button"
              onClick={() => setSelectedShipment(shipment)}
            >
              <div>
                <strong>{shipment.tracking_number}</strong>
                <p>{shipment.origin} to {shipment.destination}</p>
              </div>
              <div className="shipment-summary__meta">
                <span>{shipment.risk_level}</span>
                <span>{Math.round(Number(shipment.risk_score || 0) * 100)}%</span>
              </div>
            </button>
          ))}
          {!highRiskShipments.length ? <p className="empty-state">No high-risk shipments require intervention at the moment.</p> : null}
        </div>
      </aside>

      {selectedShipment ? (
        <Modal title={`Shipment ${selectedShipment.tracking_number}`} onClose={() => setSelectedShipment(null)}>
          <div className="detail-stack">
            <div className="info-grid">
              <div><span>Status</span><strong>{selectedShipment.status}</strong></div>
              <div><span>Risk Score</span><strong>{Math.round(Number(selectedShipment.risk_score || 0) * 100)}%</strong></div>
              <div><span>Prediction Confidence</span><strong>{getConfidencePercent(selectedShipment)}</strong></div>
              <div><span>Carrier</span><strong>{selectedShipment.carrier}</strong></div>
              <div><span>Mode</span><strong>{selectedShipment.mode}</strong></div>
              <div><span>ETA</span><strong>{formatDateTime(selectedShipment.estimated_arrival)}</strong></div>
              <div><span>Progress</span><strong>{formatPercent(selectedShipment.progress_pct)}</strong></div>
            </div>
            <div className="route-option">
              <div className="route-option__header">
                <strong>Live route performance</strong>
                <span>{selectedShipment.origin} to {selectedShipment.destination}</span>
              </div>
              <p>{selectedShipment.disruption_reason || "No active disruption narrative on this shipment."}</p>
              <div className="route-option__metrics">
                <span>{formatPercent(selectedShipment.progress_pct)} complete</span>
                <span>{selectedShipment.delay_minutes} min delay</span>
                <span>{selectedShipment.risk_level}</span>
                <span>{Math.round(calculateShipmentCost(selectedShipment).total).toLocaleString()} USD est.</span>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
