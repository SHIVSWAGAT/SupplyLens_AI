import { useMemo, useState } from "react";

import InputField from "./InputField.jsx";
import ParticleBackground from "./ParticleBackground.jsx";
import PasswordField from "./PasswordField.jsx";
import WorldMap from "./WorldMap.jsx";

const STATS = [
  { label: "ETA Accuracy", value: "98.7%", trend: "+2.3%" },
  { label: "Shipments Tracked", value: "2.4M", trend: "Live" },
  { label: "Risk Alerts", value: "143", trend: "-12%" },
  { label: "Suppliers", value: "18K+", trend: "Global" },
];

function UserIcon() {
  return (
    <svg className="login-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="login-spinner" fill="none" viewBox="0 0 24 24">
      <circle className="login-spinner__track" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="login-spinner__fill" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function validate(userId, password) {
  const nextErrors = {};

  if (!userId.trim()) {
    nextErrors.userId = "User ID is required";
  } else if (userId.trim().length < 3) {
    nextErrors.userId = "Enter a valid user ID";
  }

  if (!password) {
    nextErrors.password = "Password is required";
  } else if (password.length < 6) {
    nextErrors.password = "Password must be at least 6 characters";
  }

  return nextErrors;
}

export default function LoginPage({ error, loading, onLogin }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const apiError = useMemo(() => error || "", [error]);

  async function handleSubmit(event) {
    event?.preventDefault?.();

    const nextErrors = validate(userId, password);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || loading) {
      return;
    }

    await onLogin({
      user_id: userId.trim(),
      password,
      remember_me: rememberMe,
    });
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      handleSubmit(event);
    }
  }

  return (
    <div className="login-premium">
      <ParticleBackground />
      <div className="grid-overlay" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="login-premium__panel login-premium__panel--brand">
        <div className="login-enterprise-mark animate-fade-in-up">
          <div className="login-enterprise-mark__badge">
            <div className="login-enterprise-mark__badge-glow" />
            <div className="login-enterprise-mark__badge-face">
              <svg className="login-enterprise-mark__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </div>
          <div className="login-enterprise-mark__text">Enterprise Platform</div>
        </div>

        <div className="login-brand-copy animate-fade-in-up delay-100">
          <div className="login-brand-copy__heading">
            <h1>
              <span className="login-brand-copy__word login-brand-copy__word--light">SUPPLY</span>
              <span className="login-brand-copy__word login-brand-copy__word--accent">LENS</span>
              <span className="login-brand-copy__suffix">AI</span>
            </h1>
            <div className="login-brand-copy__tagline">
              <div className="login-brand-copy__line" />
              <p>Monitor. Predict. Optimise.</p>
              <div className="login-brand-copy__line login-brand-copy__line--reverse" />
            </div>
          </div>

          <p className="login-brand-copy__description">
            Intelligent supply chain visibility and risk prediction, giving enterprise teams real-time control over global operations.
          </p>

          <section className="login-map-card">
            <div className="login-map-card__header">
              <div className="login-map-card__status">
                <div className="login-map-card__pulse" />
                <span>Live Route Intelligence</span>
              </div>
              <span className="login-map-card__meta">Real-time</span>
            </div>
            <WorldMap />
          </section>

          <div className="login-stat-grid">
            {STATS.map((stat, index) => (
              <article
                key={stat.label}
                className="stat-card login-stat-card animate-fade-in-up"
                style={{ animationDelay: `${0.3 + index * 0.1}s` }}
              >
                <div className="login-stat-card__label">{stat.label}</div>
                <div className="login-stat-card__value">{stat.value}</div>
                <div className="login-stat-card__trend">{stat.trend}</div>
              </article>
            ))}
          </div>
        </div>

        <div className="login-brand-footer animate-fade-in delay-500">
          &copy; 2026 SupplyLens AI. Enterprise Edition v4.2
        </div>
      </div>

      <div className="login-premium__panel login-premium__panel--form">
        <div className="login-mobile-brand">
          <h1>
            <span>SUPPLYLENS</span>
            <span className="login-mobile-brand__suffix">AI</span>
          </h1>
          <p>Monitor. Predict. Optimise.</p>
        </div>

        <div className="glass-card login-auth-card animate-fade-in-up delay-200">
          <div className="login-auth-card__header">
            <div className="login-auth-card__eyebrow">
              <div className="login-auth-card__eyebrow-bar" />
              <span>Secure Access</span>
            </div>
            <h2>Welcome back</h2>
            <p>Sign in to access your supply chain control tower</p>
          </div>

          {apiError ? (
            <div className="login-error-banner animate-fade-in">
              <svg className="login-error-banner__icon" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p>{apiError}</p>
            </div>
          ) : null}

          <form className="login-auth-form" onSubmit={handleSubmit}>
            <InputField
              label="User ID / Email"
              type="text"
              value={userId}
              onChange={setUserId}
              error={fieldErrors.userId}
              icon={<UserIcon />}
              placeholder="Enter your user ID"
              autoFocus
              onKeyDown={handleKeyDown}
              autoComplete="username"
            />

            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              error={fieldErrors.password}
              placeholder="Enter your password"
              onKeyDown={handleKeyDown}
              showCapsWarning
              autoComplete="current-password"
            />

            <div className="login-auth-form__meta">
              <label className="login-remember">
                <button
                  type="button"
                  onClick={() => setRememberMe((current) => !current)}
                  className={`login-remember__box ${rememberMe ? "login-remember__box--active" : ""}`}
                >
                  {rememberMe ? (
                    <svg className="login-remember__check" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
                <span>Remember me</span>
              </label>

              <button type="button" className="login-auth-form__link">
                Forgot Password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-primary login-submit">
              {loading ? (
                <span className="login-submit__content">
                  <Spinner />
                  <span>Signing in...</span>
                </span>
              ) : (
                <span className="login-submit__content">Sign In</span>
              )}
            </button>
          </form>

          <div className="login-auth-card__divider">
            <div />
            <span>Enterprise SSO</span>
            <div />
          </div>

          <div className="login-auth-card__footer">
            <p>
              Need access?{" "}
              <button type="button" className="login-auth-form__link">
                Contact your administrator
              </button>
            </p>
          </div>
        </div>

        <div className="login-compliance animate-fade-in delay-400">
          {["SOC 2", "ISO 27001", "GDPR"].map((badge) => (
            <div key={badge} className="login-compliance__item">
              <svg className="login-compliance__icon" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{badge}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="login-scanline" />
    </div>
  );
}
