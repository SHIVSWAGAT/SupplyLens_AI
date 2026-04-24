import { useRef, useState } from "react";

export default function InputBar({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const ref = useRef(null);
  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };
  return (
    <div className="px-4 pb-5 pt-2">
      <div
        className="flex items-end gap-2 rounded-xl p-2"
        style={{
          background: "rgba(8, 14, 40, 0.9)",
          border: "1px solid rgba(56,189,248,0.18)",
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Ask about shipments, delays, or risks..."
          onChange={(e) => {
            setValue(e.target.value);
            if (ref.current) {
              ref.current.style.height = "auto";
              ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="flex-1 bg-transparent text-sm text-white/80
            placeholder:text-white/25 outline-none resize-none
            leading-relaxed py-1.5 px-2 disabled:opacity-50"
          style={{ maxHeight: 120 }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!value.trim() || disabled}
          className="w-8 h-8 rounded-lg flex items-center justify-center
            shrink-0 transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background:
              value.trim() && !disabled
                ? "linear-gradient(135deg, #0ea5e9, #6366f1)"
                : "rgba(15,23,50,0.9)",
            boxShadow:
              value.trim() && !disabled ? "0 0 16px rgba(14,165,233,0.5)" : "none",
          }}
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
      <p className="text-center text-[10px] text-white/12 mt-2">
        Shift + Enter for new line &nbsp;·&nbsp; Nexus Intelligence Engine
      </p>
    </div>
  );
}
