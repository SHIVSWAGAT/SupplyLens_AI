import ShipmentRow from "./ShipmentRow.jsx";

const COLUMNS = [
  "Tracking ID",
  "Route",
  "Carrier",
  "Mode",
  "ETA",
  "Status",
  "Risk",
  "Progress",
  "Details",
  "Track",
];

export default function ShipmentTable({ canDelete = false, onDeleteRequest, onOpenDetails, onOpenTracking, shipments }) {
  const columns = canDelete ? [...COLUMNS, "Delete"] : COLUMNS;

  return (
    <div className="shipment-table-scroll">
      <div className={`shipment-table ${canDelete ? "shipment-table--with-delete" : ""}`}>
        <div className="shipment-grid-header">
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>

        <div className="shipment-grid-body">
          {shipments.map((shipment) => (
            <ShipmentRow
              canDelete={canDelete}
              onDeleteRequest={onDeleteRequest}
              key={shipment.id}
              onOpenDetails={onOpenDetails}
              onOpenTracking={onOpenTracking}
              shipment={shipment}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
