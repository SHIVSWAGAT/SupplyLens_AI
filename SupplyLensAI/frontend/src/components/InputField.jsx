import { forwardRef, useState } from "react";

const InputField = forwardRef(function InputField(
  {
    label,
    type = "text",
    value,
    onChange,
    error = "",
    icon = null,
    placeholder = "",
    autoFocus = false,
    onKeyDown,
    autoComplete,
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || value.length > 0;

  return (
    <div className="login-field">
      <div className={`glow-input login-field__control ${error ? "error" : ""}`}>
        {icon ? (
          <span className={`login-field__icon ${focused ? "login-field__icon--active" : ""}`}>
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          placeholder={isActive ? placeholder : ""}
          className="login-field__input"
          style={{
            padding: isActive ? "1.25rem 1rem 0.5rem 2.75rem" : "1rem 1rem 1rem 2.75rem",
          }}
        />
        <label className={`login-field__label ${isActive ? "login-field__label--active" : ""}`}>
          {label}
        </label>
      </div>
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

export default InputField;
