import { useEffect, useMemo, useState } from "react";

import { computeConsignmentRiskPreview } from "../lib/utils.js";

const STEPS = ["Route", "Cargo", "Review"];

export default function NewConsignmentPage({
  cities,
  onCreate,
  onPredictRisk,
  submitting,
  successMessage,
  weatherCities,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    origin: "Mumbai",
    destination: "Dubai",
    carrier: "DHL",
    mode: "Air",
    cargo_type: "Electronics",
    weight_kg: "1200",
    customer: "Acme Retail",
    departure_time: "",
    estimated_arrival: "",
    priority: "Critical",
    hazardous: false,
    contact_name: "Operations Desk",
    contact_email: "ops@example.com",
    contact_phone: "+1 555 0100",
    notes: "",
  });
  const [error, setError] = useState("");
  const [mlPreview, setMlPreview] = useState({
    loading: false,
    data: null,
  });

  const preview = useMemo(
    () => computeConsignmentRiskPreview(form, weatherCities),
    [form, weatherCities],
  );

  useEffect(() => {
    let active = true;
    const timerId = window.setTimeout(async () => {
      if (!onPredictRisk || !form.origin || !form.destination) {
        return;
      }

      setMlPreview((current) => ({ ...current, loading: true }));
      try {
        const originCity = cities.find((city) => city.name === form.origin);
        const destinationCity = cities.find((city) => city.name === form.destination);
        const distance = originCity && destinationCity
          ? Math.max(
              Math.abs(Number(originCity.lat) - Number(destinationCity.lat)) * 111
              + Math.abs(Number(originCity.lng) - Number(destinationCity.lng)) * 85,
              120,
            )
          : 1400;
        const prediction = await onPredictRisk({
          delay_minutes: 0,
          weather_risk: preview.score,
          congestion_index: preview.score * 0.7,
          route_distance: distance,
          cargo_type: form.cargo_type,
          transport_mode: form.mode,
          carrier_performance: 0.82,
          weight_kg: Number(form.weight_kg || 1000),
        });
        if (active) {
          setMlPreview({ loading: false, data: prediction });
        }
      } catch (predictionError) {
        if (active) {
          setMlPreview({ loading: false, data: null });
        }
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [cities, form, onPredictRisk, preview.score]);

  function validateStep() {
    if (step === 0 && (!form.origin || !form.destination || !form.carrier || !form.mode)) {
      return "Route and carrier details are required.";
    }
    if (step === 1 && (!form.cargo_type || !form.weight_kg || !form.customer)) {
      return "Cargo details are required.";
    }
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (step < STEPS.length - 1) {
      setError("");
      setStep((current) => current + 1);
      return;
    }

    try {
      setError("");
      await onCreate(form);
      setStep(0);
    } catch (submissionError) {
      setError(submissionError.message || "Unable to create the shipment.");
    }
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">New Consignment</p>
          <h1>New Shipment Setup</h1>
          <p>Capture route, cargo, and contact data before releasing a shipment into execution.</p>
        </div>

        <div className="stepper">
          {STEPS.map((label, index) => (
            <div key={label} className={`stepper__item ${index <= step ? "stepper__item--active" : ""}`}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>

        <form className="page-grid" onSubmit={handleSubmit}>
          {step === 0 ? (
            <div className="form-grid">
              <div className="form-section">
                <h2>Route & Carrier Details</h2>
                <label>
                  Origin
                  <input list="city-list" value={form.origin} onChange={(event) => setForm((current) => ({ ...current, origin: event.target.value }))} />
                </label>
                <label>
                  Destination
                  <input list="city-list" value={form.destination} onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))} />
                </label>
                <label>
                  Carrier
                  <input value={form.carrier} onChange={(event) => setForm((current) => ({ ...current, carrier: event.target.value }))} />
                </label>
                <label>
                  Mode
                  <select value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value }))}>
                    <option value="Air">Air</option>
                    <option value="Sea">Sea</option>
                    <option value="Road">Road</option>
                    <option value="Rail">Rail</option>
                  </select>
                </label>
                <label>
                  Departure Time
                  <input type="datetime-local" value={form.departure_time} onChange={(event) => setForm((current) => ({ ...current, departure_time: event.target.value }))} />
                </label>
                <label>
                  Estimated Arrival
                  <input type="datetime-local" value={form.estimated_arrival} onChange={(event) => setForm((current) => ({ ...current, estimated_arrival: event.target.value }))} />
                </label>
              </div>
              <div className="form-section">
                <h2>AI Risk Preview</h2>
                <div className={`risk-preview risk-preview--${preview.level.toLowerCase()}`}>
                  <strong>{preview.level} Risk</strong>
                  <span>{Math.round(preview.score * 100)}%</span>
                </div>
                <div className="recommendation-row">
                  ML risk: {Math.round(Number(mlPreview.data?.risk_score || 0) * 100)}%
                  {mlPreview.loading ? " (updating)" : ""}
                </div>
                <div className="recommendation-row">
                  Confidence: {Math.round(Number(mlPreview.data?.confidence || 0) * 100)}%
                </div>
                <div className="list-stack">
                  {(mlPreview.data?.top_factors?.length ? mlPreview.data.top_factors : preview.drivers).map((driver) => (
                    <div key={driver} className="recommendation-row">{driver}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="form-grid">
              <div className="form-section">
                <h2>Cargo Details</h2>
                <label>
                  Cargo Type
                  <input value={form.cargo_type} onChange={(event) => setForm((current) => ({ ...current, cargo_type: event.target.value }))} />
                </label>
                <label>
                  Weight (kg)
                  <input type="number" min="1" value={form.weight_kg} onChange={(event) => setForm((current) => ({ ...current, weight_kg: event.target.value }))} />
                </label>
                <label>
                  Customer
                  <input value={form.customer} onChange={(event) => setForm((current) => ({ ...current, customer: event.target.value }))} />
                </label>
                <label>
                  Priority
                  <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                    <option value="Balanced">Balanced</option>
                    <option value="Critical">Critical</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={form.hazardous} onChange={(event) => setForm((current) => ({ ...current, hazardous: event.target.checked }))} />
                  Hazardous cargo
                </label>
              </div>

              <div className="form-section">
                <h2>Contact & Options</h2>
                <label>
                  Contact Name
                  <input value={form.contact_name} onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))} />
                </label>
                <label>
                  Contact Email
                  <input type="email" value={form.contact_email} onChange={(event) => setForm((current) => ({ ...current, contact_email: event.target.value }))} />
                </label>
                <label>
                  Contact Phone
                  <input value={form.contact_phone} onChange={(event) => setForm((current) => ({ ...current, contact_phone: event.target.value }))} />
                </label>
                <label>
                  Notes
                  <textarea rows={6} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                </label>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="form-grid">
              <div className="form-section">
                <h2>Summary Preview</h2>
                <div className="info-grid">
                  <div><span>Route</span><strong>{form.origin} to {form.destination}</strong></div>
                  <div><span>Carrier / Mode</span><strong>{form.carrier} / {form.mode}</strong></div>
                  <div><span>Cargo</span><strong>{form.cargo_type}</strong></div>
                  <div><span>Weight</span><strong>{form.weight_kg} kg</strong></div>
                  <div><span>Priority</span><strong>{form.priority}</strong></div>
                  <div><span>Customer</span><strong>{form.customer}</strong></div>
                </div>
              </div>

              <div className="form-section">
                <h2>AI Risk Preview</h2>
                <div className={`risk-preview risk-preview--${preview.level.toLowerCase()}`}>
                  <strong>{preview.level} Risk</strong>
                  <span>{Math.round(preview.score * 100)}%</span>
                </div>
                <div className="list-stack">
                  {(mlPreview.data?.top_factors?.length ? mlPreview.data.top_factors : preview.drivers).map((driver) => (
                    <div key={driver} className="recommendation-row">{driver}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <datalist id="city-list">
            {cities.map((city) => (
              <option key={city.name} value={city.name} />
            ))}
          </datalist>

          {error ? <div className="banner banner--danger">{error}</div> : null}
          {successMessage ? <div className="banner banner--success">{successMessage}</div> : null}

          <div className="form-actions form-actions--split">
            <button type="button" className="ghost-button" onClick={goBack} disabled={step === 0}>
              Back
            </button>
            <button type="submit" disabled={submitting}>
              {step < STEPS.length - 1 ? "Continue" : submitting ? "Creating shipment..." : "Create shipment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
