import NexusOrb from "./NexusOrb.jsx";

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <div className="shrink-0">
        <NexusOrb size={28} />
      </div>
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3"
        style={{
          background: "rgba(15, 23, 50, 0.8)",
          border: "1px solid rgba(56,189,248,0.1)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-sky-400/60 italic">Analyzing data</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-sky-400/60"
                style={{
                  animation: `nexusBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
