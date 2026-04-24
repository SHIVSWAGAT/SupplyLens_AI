import NexusOrb from "./NexusOrb.jsx";

export default function FloatingButton({ onClick, active }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2">
      <div
        className="text-[10px] font-bold tracking-[0.2em] uppercase text-sky-400/80 text-center"
        style={{ textShadow: "0 0 12px rgba(56,189,248,0.6)" }}
      >
        Nexus AI
      </div>
      <button
        type="button"
        onClick={onClick}
        className="relative flex items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:ring-offset-0"
        style={{ WebkitAppearance: "none", appearance: "none", width: 56, height: 56 }}
      >
        {!active && (
          <span
            className="absolute rounded-full"
            style={{
              inset: -8,
              background: "transparent",
              border: "1px solid rgba(56,189,248,0.35)",
              animation: "nexusRing 2s ease-out infinite",
            }}
          />
        )}
        {!active && (
          <span
            className="absolute rounded-full"
            style={{
              inset: -16,
              background: "transparent",
              border: "1px solid rgba(99,102,241,0.2)",
              animation: "nexusRing 2s ease-out 0.5s infinite",
            }}
          />
        )}
        {!active && (
          <span
            className="absolute rounded-full"
            style={{
              inset: -26,
              background: "transparent",
              border: "1px solid rgba(56,189,248,0.1)",
              animation: "nexusRing 2.4s ease-out 1s infinite",
            }}
          />
        )}
        <span className="relative z-10 transition-all duration-300" style={{ width: 56, height: 56 }}>
          <NexusOrb size={56} active={active}>
            {active ? (
              <svg
                className="h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.25}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : null}
          </NexusOrb>
        </span>
      </button>
    </div>
  );
}
