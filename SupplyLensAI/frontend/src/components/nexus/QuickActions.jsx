const ACTIONS = [
  { label: "Show shipments at high risk", icon: "🚢" },
  { label: "Show active alerts", icon: "⚠️" },
  { label: "Optimize the highest-risk route", icon: "🧭" },
  { label: "Summarize network KPIs", icon: "📊" },
];

export default function QuickActions({ onSelect, disabled }) {
  return (
    <div className="px-4 pb-2">
      <p className="text-[10px] font-semibold tracking-widest text-white/20 uppercase mb-2">
        Quick actions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(a.label)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
              text-white/55 hover:text-white/90 transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "rgba(15, 23, 50, 0.8)",
              border: "1px solid rgba(56,189,248,0.1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(56,189,248,0.3)";
              e.currentTarget.style.background = "rgba(15,23,50,1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(56,189,248,0.1)";
              e.currentTarget.style.background = "rgba(15,23,50,0.8)";
            }}
          >
            <span>{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
