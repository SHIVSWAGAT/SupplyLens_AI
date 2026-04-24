import { useEffect } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

function hasCoordinates(point) {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  );
}

function routeColor(route) {
  const risk = Number(route?.risk_score || 0);
  if (risk >= 0.5) {
    return "#fb7185";
  }
  if (risk >= 0.25) {
    return "#f59e0b";
  }
  return "#38bdf8";
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function MapViewport() {
  const map = useMap();

  useEffect(() => {
    const refreshSize = () => map.invalidateSize(true);
    refreshSize();
    const t1 = window.setTimeout(refreshSize, 150);
    const t2 = window.setTimeout(refreshSize, 450);
    const onResize = () => refreshSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);

  return null;
}

export default function OperationsMap({ filteredShipments, mapCenter, routes, selectedRouteId }) {
  return (
    <MapContainer center={mapCenter} zoom={3} minZoom={2} scrollWheelZoom className="map-frame">
      <MapViewport />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {filteredShipments
        .filter((shipment) => hasCoordinates(shipment.current_coords))
        .map((shipment) => (
          <Marker
            key={shipment.id}
            position={[Number(shipment.current_coords.lat), Number(shipment.current_coords.lng)]}
          >
            <Popup>
              <strong>{shipment.tracking_number}</strong>
              <br />
              {shipment.origin} to {shipment.destination}
              <br />
              {shipment.status} | {shipment.carrier}
              <br />
              Progress: {formatPercent(shipment.progress_pct)}
            </Popup>
          </Marker>
        ))}
      {routes.map((route) => {
        const positions = route.waypoints
          .filter((waypoint) => hasCoordinates(waypoint))
          .map((waypoint) => [Number(waypoint.lat), Number(waypoint.lng)]);

        if (positions.length < 2) {
          return null;
        }

        const isSelected = route.id === selectedRouteId;
        return (
          <Polyline
            key={route.id}
            pathOptions={{
              color: routeColor(route),
              weight: isSelected ? 6 : 4,
              opacity: isSelected ? 0.95 : 0.55,
            }}
            positions={positions}
          />
        );
      })}
    </MapContainer>
  );
}
