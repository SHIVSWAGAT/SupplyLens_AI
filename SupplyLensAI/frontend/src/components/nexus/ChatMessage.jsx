import NexusOrb from "./NexusOrb.jsx";

function Dot({ type }) {
  const color =
    type === "risk" ? "bg-red-400" : type === "ok" ? "bg-teal-400" : "bg-sky-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5 shrink-0 mt-0.5`} />;
}

export default function ChatMessage({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4 py-1.5 animate-nexus-message">
        <div
          className="max-w-[82%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white leading-relaxed"
          style={{
            background:
              "linear-gradient(135deg, rgba(14,165,233,0.22) 0%, rgba(99,102,241,0.18) 100%)",
            border: "1px solid rgba(56,189,248,0.2)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5 animate-nexus-message">
      <div className="mt-0.5 shrink-0">
        <NexusOrb size={28} />
      </div>
      <div className="flex flex-col gap-2 max-w-[86%]">
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-white/85 leading-relaxed"
          style={{
            background: "rgba(15, 23, 50, 0.75)",
            border: "1px solid rgba(56,189,248,0.08)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message.text}
        </div>
        {message.insights && message.insights.length > 0 && (
          <div
            className="rounded-xl px-3 py-2.5 flex flex-col gap-2"
            style={{
              background: "rgba(8, 14, 40, 0.85)",
              border: "1px solid rgba(99,102,241,0.18)",
            }}
          >
            <div className="text-[10px] font-bold tracking-widest text-indigo-400/60 uppercase mb-0.5">
              Key Insights
            </div>
            {message.insights.map((ins, i) => (
              <div key={i} className="flex items-start text-xs">
                <Dot type={ins.type} />
                <span className="text-white/45 mr-1.5 shrink-0">{ins.label}:</span>
                <span className="text-white/80">{ins.value}</span>
              </div>
            ))}
          </div>
        )}
        {message.timestamp ? (
          <div className="text-[10px] text-white/20 px-1">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
