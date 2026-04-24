import { forwardRef, useState } from "react";

function LockIcon() {
  return (
    <svg className="login-password__icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg className="login-password__icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  ) : (
    <svg className="login-password__icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

const PasswordField = forwardRef(function PasswordField(
  {
    label,
    value,
    onChange,
    error = "",
    placeholder = "",
    onKeyDown,
    showCapsWarning = false,
    autoComplete,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const isActive = focused || value.length > 0;

  const handleKeyDown = (event) => {
    setCapsLock(event.getModifierState("CapsLock"));
    onKeyDown?.(event);
  };

  return (
    <div className="login-field">
      <div className={`glow-input login-field__control ${error ? "error" : ""}`}>
        <span className={`login-field__icon ${focused ? "login-field__icon--active" : ""}`}>
          <LockIcon />
        </span>
        <input
          ref={ref}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          autoComplete={autoComplete}
          placeholder={isActive ? placeholder : ""}
          className="login-field__input"
          style={{
            padding: isActive ? "1.25rem 3rem 0.5rem 2.75rem" : "1rem 3rem 1rem 2.75rem",
          }}
        />
        <label className={`login-field__label ${isActive ? "login-field__label--active" : ""}`}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="login-password__toggle"
          tabIndex={-1}
        >
          <EyeIcon open={showPassword} />
        </button>
      </div>

      {showCapsWarning && capsLock && focused ? (
        <p className="login-field__message login-field__message--warning">
          <svg className="login-field__message-icon" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Caps Lock is on
        </p>
      ) : null}

      {error ? (
        <p className="login-field__message login-field__message--error">
          <svg className="login-field__message-icon" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  );
});

export default PasswordField;
