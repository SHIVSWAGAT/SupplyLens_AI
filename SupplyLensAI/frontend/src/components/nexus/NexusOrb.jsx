/**
 * Nexus mark: luminous blue sphere with soft radiating light (no glyph).
 */
export default function NexusOrb({ size = 28, active = false, className = "", children = null }) {
  const s = size;
  const glow1 = s * 1.75;
  const glow2 = s * 2.35;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${className}`}
      style={{ width: s, height: s }}
    >
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          width: glow2,
          height: glow2,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(56,189,248,0.22) 0%, rgba(14,165,233,0.08) 42%, transparent 68%)",
        }}
      />
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          width: glow1,
          height: glow1,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(224,242,254,0.5) 0%, rgba(56,189,248,0.25) 35%, transparent 72%)",
          filter: "blur(5px)",
          animation: "nexusPulse 2.2s ease-in-out infinite",
        }}
      />
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          width: s * 1.15,
          height: s * 1.15,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(125,211,252,0.12) 50%, transparent 70%)",
          filter: "blur(3px)",
        }}
      />
      <span
        className="relative z-[1] block rounded-full"
        style={{
          width: s,
          height: s,
          background: active
            ? "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.9) 0%, rgba(186,230,253,1) 14%, #38bdf8 38%, #0284c7 78%, #075985 100%)"
            : "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.65) 0%, rgba(125,211,252,0.95) 16%, #0ea5e9 42%, #0369a1 100%)",
          boxShadow: active
            ? `0 0 ${Math.max(8, s * 0.28)}px rgba(56,189,248,0.85), 0 0 ${Math.max(16, s * 0.65)}px rgba(14,165,233,0.4), inset 0 2px ${Math.max(4, s * 0.08)}px rgba(255,255,255,0.55), inset 0 -${Math.max(4, s * 0.1)}px ${Math.max(8, s * 0.18)}px rgba(3,105,161,0.45)`
            : `0 0 ${Math.max(6, s * 0.22)}px rgba(56,189,248,0.65), 0 0 ${Math.max(12, s * 0.5)}px rgba(14,165,233,0.28), inset 0 2px ${Math.max(3, s * 0.07)}px rgba(255,255,255,0.4), inset 0 -${Math.max(3, s * 0.08)}px ${Math.max(6, s * 0.15)}px rgba(3,105,161,0.4)`,
          border: "none",
        }}
      />
      {children ? (
        <span className="absolute inset-0 z-[2] flex items-center justify-center">{children}</span>
      ) : null}
    </div>
  );
}
