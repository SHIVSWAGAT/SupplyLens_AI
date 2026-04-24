export default function FiltersBar({
  modeFilter,
  onModeChange,
  onRiskChange,
  onSearchChange,
  onStatusChange,
  riskFilter,
  search,
  statusFilter,
}) {
  return (
    <div className="shipment-filters">
      <div className="shipment-filters__group">
        <select value={statusFilter} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="All">All Status</option>
          <option value="On Time">On Time</option>
          <option value="At Risk">At Risk</option>
          <option value="Delayed">Delayed</option>
          <option value="Critical">Critical</option>
        </select>

        <select value={riskFilter} onChange={(event) => onRiskChange(event.target.value)}>
          <option value="All">All Risk Levels</option>
          <option value="low">Low Risk</option>
          <option value="moderate">Moderate Risk</option>
          <option value="high">High Risk</option>
          <option value="critical">Critical Risk</option>
        </select>

        <select value={modeFilter} onChange={(event) => onModeChange(event.target.value)}>
          <option value="All">All Modes</option>
          <option value="Air">Air</option>
          <option value="Rail">Rail</option>
          <option value="Sea">Sea</option>
          <option value="Road">Road</option>
        </select>
      </div>

      <div className="shipment-filters__search">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search shipments..."
        />
      </div>
    </div>
  );
}
